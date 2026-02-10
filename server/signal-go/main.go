package main

import (
	"bufio"
	"crypto/sha1"
	"embed"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math"
	"math/rand"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

const (
	roomTTL           = 5 * time.Minute
	maxPlayersDefault = 10
	wsMagic           = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
)

//go:embed web
var embeddedFiles embed.FS

type peer struct {
	id      string
	conn    net.Conn
	writeMu sync.Mutex
	closed  atomic.Bool
}

type player struct {
	PeerID string `json:"peerId"`
	Name   string `json:"name"`
	Ready  bool   `json:"ready"`
	IsHost bool   `json:"isHost"`
}

type room struct {
	RoomID     string   `json:"roomId"`
	RoomName   string   `json:"roomName"`
	Status     string   `json:"status"`
	MaxPlayers int      `json:"maxPlayers"`
	CreatedAt  int64    `json:"createdAt"`
	LastActive int64    `json:"lastActiveAt"`
	Players    []player `json:"players"`
}

type envelope struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	RequestID string          `json:"requestId,omitempty"`
}

type server struct {
	mu         sync.Mutex
	peers      map[string]*peer
	rooms      map[string]*room
	peerToRoom map[string]string
	peerSeq    uint64
	startTime  time.Time
	webRoot    fs.FS
}

func newServer() *server {
	web, err := fs.Sub(embeddedFiles, "web")
	if err != nil {
		log.Fatalf("failed to mount embedded web assets: %v", err)
	}
	return &server{
		peers:      make(map[string]*peer),
		rooms:      make(map[string]*room),
		peerToRoom: make(map[string]string),
		startTime:  time.Now(),
		webRoot:    web,
	}
}

func (s *server) makePeerID() string {
	n := atomic.AddUint64(&s.peerSeq, 1)
	return fmt.Sprintf("peer-%d", n)
}

func (s *server) makeRoomID() string {
	randPart := strconv.FormatInt(rand.Int63n(36*36*36*36*36*36), 36)
	for len(randPart) < 6 {
		randPart = "0" + randPart
	}
	tail := strconv.FormatInt(time.Now().UnixMilli(), 36)
	if len(tail) > 3 {
		tail = tail[len(tail)-3:]
	}
	return "room-" + randPart + tail
}

func (p *peer) send(msgType string, payload any, requestID string) {
	if p == nil || p.closed.Load() {
		return
	}
	out := map[string]any{"type": msgType, "payload": payload}
	if requestID != "" {
		out["requestId"] = requestID
	}
	data, err := json.Marshal(out)
	if err != nil {
		return
	}
	_ = p.writeText(data)
}

func (p *peer) sendError(code, message, requestID string) {
	p.send("error", map[string]any{"code": code, "message": message}, requestID)
}

func (p *peer) writeText(payload []byte) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if p.closed.Load() {
		return net.ErrClosed
	}
	return writeWSFrame(p.conn, 0x1, payload)
}

func (s *server) health() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]any{
		"ok":        true,
		"rooms":     len(s.rooms),
		"peers":     len(s.peers),
		"uptimeSec": int(time.Since(s.startTime).Seconds()),
	}
}

func (s *server) listOpenRooms() []map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := make([]map[string]any, 0, len(s.rooms))
	for _, r := range s.rooms {
		if r.Status != "lobby" || len(r.Players) >= r.MaxPlayers {
			continue
		}
		hostName := "Host"
		for _, pl := range r.Players {
			if pl.IsHost {
				hostName = pl.Name
				break
			}
		}
		list = append(list, map[string]any{
			"roomId":     r.RoomID,
			"roomName":   r.RoomName,
			"hostName":   hostName,
			"players":    len(r.Players),
			"maxPlayers": r.MaxPlayers,
			"status":     r.Status,
		})
	}
	return list
}

func (s *server) roomState(r *room) map[string]any {
	players := make([]player, len(r.Players))
	copy(players, r.Players)
	return map[string]any{
		"roomId":     r.RoomID,
		"roomName":   r.RoomName,
		"status":     r.Status,
		"maxPlayers": r.MaxPlayers,
		"players":    players,
	}
}

func (s *server) removePeer(peerID string) {
	s.mu.Lock()
	p := s.peers[peerID]
	delete(s.peers, peerID)
	roomID, hasRoom := s.peerToRoom[peerID]
	delete(s.peerToRoom, peerID)
	if p != nil {
		p.closed.Store(true)
		_ = p.conn.Close()
	}
	if !hasRoom {
		s.mu.Unlock()
		return
	}
	r, ok := s.rooms[roomID]
	if !ok {
		s.mu.Unlock()
		return
	}
	r.Players = filterPlayers(r.Players, peerID)
	r.LastActive = time.Now().UnixMilli()
	if len(r.Players) == 0 {
		delete(s.rooms, roomID)
		s.mu.Unlock()
		return
	}
	hasHost := false
	for i := range r.Players {
		if r.Players[i].IsHost {
			hasHost = true
			break
		}
	}
	if !hasHost {
		r.Players[0].IsHost = true
	}
	recipients := s.roomRecipientsLocked(r)
	state := s.roomState(r)
	s.mu.Unlock()
	s.broadcastRoomState(recipients, state)
}

func filterPlayers(players []player, peerID string) []player {
	out := players[:0]
	for _, p := range players {
		if p.PeerID != peerID {
			out = append(out, p)
		}
	}
	return out
}

func (s *server) roomRecipientsLocked(r *room) []*peer {
	result := make([]*peer, 0, len(r.Players))
	for _, pl := range r.Players {
		if p := s.peers[pl.PeerID]; p != nil && !p.closed.Load() {
			result = append(result, p)
		}
	}
	return result
}

func (s *server) broadcastRoomState(recipients []*peer, roomState map[string]any) {
	payload := map[string]any{"room": roomState}
	for _, p := range recipients {
		p.send("room.state", payload, "")
	}
}

func parsePayload(raw json.RawMessage) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return map[string]any{}
	}
	if out == nil {
		return map[string]any{}
	}
	return out
}

func getString(m map[string]any, key, fallback string) string {
	v, ok := m[key]
	if !ok {
		return fallback
	}
	s, ok := v.(string)
	if !ok {
		return fallback
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return fallback
	}
	return s
}

func getBool(m map[string]any, key string) bool {
	v, ok := m[key]
	if !ok {
		return false
	}
	b, ok := v.(bool)
	if !ok {
		return false
	}
	return b
}

func getInt(m map[string]any, key string, fallback int) int {
	v, ok := m[key]
	if !ok {
		return fallback
	}
	switch n := v.(type) {
	case float64:
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return fallback
		}
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(n))
		if err != nil {
			return fallback
		}
		return parsed
	default:
		return fallback
	}
}

func (s *server) handleMessage(peerID string, env envelope) {
	payload := parsePayload(env.Payload)
	requestID := env.RequestID

	s.mu.Lock()
	p := s.peers[peerID]
	s.mu.Unlock()
	if p == nil {
		return
	}

	switch env.Type {
	case "room.list.request":
		p.send("room.list.response", map[string]any{"rooms": s.listOpenRooms()}, requestID)
		return

	case "room.create":
		roomName := getString(payload, "roomName", "LAN Room")
		hostName := getString(payload, "hostName", "Player1")
		if len(hostName) > 16 {
			hostName = hostName[:16]
		}
		maxPlayers := getInt(payload, "maxPlayers", maxPlayersDefault)
		if maxPlayers < 2 {
			maxPlayers = 2
		}
		if maxPlayers > maxPlayersDefault {
			maxPlayers = maxPlayersDefault
		}

		r := &room{
			RoomID:     s.makeRoomID(),
			RoomName:   roomName,
			Status:     "lobby",
			MaxPlayers: maxPlayers,
			CreatedAt:  time.Now().UnixMilli(),
			LastActive: time.Now().UnixMilli(),
			Players: []player{{
				PeerID: peerID,
				Name:   hostName,
				Ready:  true,
				IsHost: true,
			}},
		}

		s.mu.Lock()
		s.peerToRoom[peerID] = r.RoomID
		s.rooms[r.RoomID] = r
		state := s.roomState(r)
		s.mu.Unlock()

		p.send("room.created", map[string]any{"selfPeerId": peerID, "room": state}, requestID)
		return

	case "room.join":
		roomID := getString(payload, "roomId", "")
		name := getString(payload, "playerName", "")
		if len(name) > 16 {
			name = name[:16]
		}
		s.mu.Lock()
		r := s.rooms[roomID]
		if r == nil {
			s.mu.Unlock()
			p.send("room.not_found", map[string]any{"roomId": roomID}, requestID)
			return
		}
		if len(r.Players) >= r.MaxPlayers {
			cur, max := len(r.Players), r.MaxPlayers
			s.mu.Unlock()
			p.send("room.full", map[string]any{"roomId": roomID, "currentPlayers": cur, "maxPlayers": max}, requestID)
			return
		}
		if r.Status != "lobby" {
			s.mu.Unlock()
			p.sendError("forbidden", "Match already started", requestID)
			return
		}
		if name == "" {
			name = fmt.Sprintf("Player%d", len(r.Players)+1)
		}
		s.peerToRoom[peerID] = roomID
		r.Players = append(r.Players, player{PeerID: peerID, Name: name, Ready: false, IsHost: false})
		r.LastActive = time.Now().UnixMilli()
		state := s.roomState(r)
		recipients := s.roomRecipientsLocked(r)
		s.mu.Unlock()

		p.send("room.joined", map[string]any{"selfPeerId": peerID, "room": state}, requestID)
		s.broadcastRoomState(recipients, state)
		return

	case "room.leave":
		s.removePeer(peerID)
		return
	}

	s.mu.Lock()
	roomID := s.peerToRoom[peerID]
	r := s.rooms[roomID]
	if r == nil {
		s.mu.Unlock()
		p.sendError("room_not_found", "Room no longer exists", requestID)
		return
	}
	playerIdx := -1
	for i := range r.Players {
		if r.Players[i].PeerID == peerID {
			playerIdx = i
			break
		}
	}
	if playerIdx < 0 {
		s.mu.Unlock()
		p.sendError("forbidden", "Unknown player", requestID)
		return
	}
	pl := &r.Players[playerIdx]

	switch env.Type {
	case "peer.ready":
		pl.Ready = getBool(payload, "ready")
		r.LastActive = time.Now().UnixMilli()
		recipients := s.roomRecipientsLocked(r)
		state := s.roomState(r)
		s.mu.Unlock()
		s.broadcastRoomState(recipients, state)
		return

	case "peer.rename":
		name := getString(payload, "name", "")
		if len(name) > 16 {
			name = name[:16]
		}
		if name == "" {
			name = fmt.Sprintf("Player%d", playerIdx+1)
		}
		pl.Name = name
		r.LastActive = time.Now().UnixMilli()
		recipients := s.roomRecipientsLocked(r)
		state := s.roomState(r)
		eventRecipients := append([]*peer(nil), recipients...)
		s.mu.Unlock()
		for _, rp := range eventRecipients {
			rp.send("peer.rename", map[string]any{"peerId": peerID, "roomId": roomID, "name": pl.Name}, "")
		}
		s.broadcastRoomState(recipients, state)
		return

	case "chat.msg":
		text := getString(payload, "text", "")
		if text == "" {
			s.mu.Unlock()
			return
		}
		if len(text) > 200 {
			text = text[:200]
		}
		recipients := s.roomRecipientsLocked(r)
		name := pl.Name
		s.mu.Unlock()
		msgPayload := map[string]any{"roomId": roomID, "peerId": peerID, "name": name, "text": text, "at": time.Now().UnixMilli()}
		for _, rp := range recipients {
			rp.send("chat.msg", msgPayload, "")
		}
		return

	case "match.start":
		if !pl.IsHost {
			s.mu.Unlock()
			p.sendError("forbidden", "Only host can start match", requestID)
			return
		}
		forceStart := getBool(payload, "forceStart")
		readyCount := 0
		for _, rp := range r.Players {
			if rp.Ready {
				readyCount++
			}
		}
		if !forceStart && readyCount < 2 {
			s.mu.Unlock()
			p.sendError("bad_request", "Need at least 2 ready players", requestID)
			return
		}
		r.Status = "in-game"
		r.LastActive = time.Now().UnixMilli()
		recipients := s.roomRecipientsLocked(r)
		state := s.roomState(r)
		s.mu.Unlock()
		startPayload := map[string]any{"roomId": roomID, "startedAt": time.Now().UnixMilli()}
		for _, rp := range recipients {
			rp.send("match.start", startPayload, "")
		}
		s.broadcastRoomState(recipients, state)
		return

	case "game.input", "shop.buy", "shop.sell", "shop.done":
		if pl.IsHost {
			s.mu.Unlock()
			p.sendError("forbidden", "Host should apply actions locally", requestID)
			return
		}
		var hostPeerID string
		for _, rp := range r.Players {
			if rp.IsHost {
				hostPeerID = rp.PeerID
				break
			}
		}
		hostPeer := s.peers[hostPeerID]
		s.mu.Unlock()
		if hostPeer == nil {
			p.sendError("room_not_found", "Host unavailable", requestID)
			return
		}
		switch env.Type {
		case "game.input":
			hostPeer.send("game.input", map[string]any{"peerId": peerID, "data": payload}, "")
		case "shop.buy", "shop.sell":
			weaponID := getString(payload, "weaponId", "")
			hostPeer.send(env.Type, map[string]any{"peerId": peerID, "roomId": roomID, "weaponId": weaponID}, "")
		case "shop.done":
			hostPeer.send("shop.done", map[string]any{"peerId": peerID, "roomId": roomID, "done": getBool(payload, "done")}, "")
		}
		return

	case "game.snapshot":
		if !pl.IsHost {
			s.mu.Unlock()
			p.sendError("forbidden", "Only host can send snapshots", requestID)
			return
		}
		recipients := make([]*peer, 0, len(r.Players))
		for _, rp := range r.Players {
			if rp.PeerID == peerID {
				continue
			}
			if target := s.peers[rp.PeerID]; target != nil {
				recipients = append(recipients, target)
			}
		}
		r.LastActive = time.Now().UnixMilli()
		s.mu.Unlock()
		for _, rp := range recipients {
			rp.send("game.snapshot", payload, "")
		}
		return
	}

	s.mu.Unlock()
	p.sendError("bad_request", "Unknown type: "+env.Type, requestID)
}

func (s *server) cleanupExpiredRooms(stop <-chan struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			now := time.Now().UnixMilli()
			s.mu.Lock()
			for roomID, r := range s.rooms {
				if len(r.Players) == 0 || now-r.LastActive > roomTTL.Milliseconds() {
					for _, pl := range r.Players {
						delete(s.peerToRoom, pl.PeerID)
					}
					delete(s.rooms, roomID)
				}
			}
			s.mu.Unlock()
		case <-stop:
			return
		}
	}
}

func (s *server) handleWS(w http.ResponseWriter, r *http.Request) {
	if !headerContainsToken(r.Header.Get("Connection"), "Upgrade") || !headerContainsToken(r.Header.Get("Upgrade"), "websocket") {
		http.Error(w, "upgrade required", http.StatusUpgradeRequired)
		return
	}

	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	if key == "" {
		http.Error(w, "bad websocket key", http.StatusBadRequest)
		return
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijacking not supported", http.StatusInternalServerError)
		return
	}

	conn, rw, err := hj.Hijack()
	if err != nil {
		http.Error(w, "hijack failed", http.StatusInternalServerError)
		return
	}

	hash := sha1.Sum([]byte(key + wsMagic))
	accept := base64.StdEncoding.EncodeToString(hash[:])
	resp := strings.Join([]string{
		"HTTP/1.1 101 Switching Protocols",
		"Upgrade: websocket",
		"Connection: Upgrade",
		"Sec-WebSocket-Accept: " + accept,
		"",
		"",
	}, "\r\n")
	if _, err := conn.Write([]byte(resp)); err != nil {
		_ = conn.Close()
		return
	}

	peerID := s.makePeerID()
	p := &peer{id: peerID, conn: conn}
	s.mu.Lock()
	s.peers[peerID] = p
	s.mu.Unlock()

	go func() {
		defer s.removePeer(peerID)
		reader := rw.Reader
		for {
			opcode, payload, err := readWSFrame(reader)
			if err != nil {
				if !isExpectedConnClose(err) {
					log.Printf("ws read error (%s): %v", peerID, err)
				}
				return
			}
			switch opcode {
			case 0x8:
				return
			case 0x9:
				_ = p.writePong()
			case 0x1:
				var env envelope
				if err := json.Unmarshal(payload, &env); err != nil {
					p.sendError("bad_request", "Invalid JSON payload", "")
					continue
				}
				s.handleMessage(peerID, env)
			}
		}
	}()
}

func (p *peer) writePong() error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if p.closed.Load() {
		return net.ErrClosed
	}
	return writeWSFrame(p.conn, 0xA, nil)
}

func writeWSFrame(w io.Writer, opcode byte, payload []byte) error {
	header := []byte{0x80 | opcode, 0}
	length := len(payload)
	switch {
	case length < 126:
		header[1] = byte(length)
	case length <= 65535:
		header[1] = 126
		ext := make([]byte, 2)
		binary.BigEndian.PutUint16(ext, uint16(length))
		header = append(header, ext...)
	default:
		header[1] = 127
		ext := make([]byte, 8)
		binary.BigEndian.PutUint64(ext, uint64(length))
		header = append(header, ext...)
	}
	if _, err := w.Write(header); err != nil {
		return err
	}
	if length > 0 {
		_, err := w.Write(payload)
		return err
	}
	return nil
}

func readWSFrame(r *bufio.Reader) (opcode byte, payload []byte, err error) {
	head := make([]byte, 2)
	if _, err = io.ReadFull(r, head); err != nil {
		return 0, nil, err
	}
	opcode = head[0] & 0x0F
	masked := (head[1] & 0x80) != 0
	lengthCode := int(head[1] & 0x7F)
	length := 0

	switch lengthCode {
	case 126:
		ext := make([]byte, 2)
		if _, err = io.ReadFull(r, ext); err != nil {
			return 0, nil, err
		}
		length = int(binary.BigEndian.Uint16(ext))
	case 127:
		ext := make([]byte, 8)
		if _, err = io.ReadFull(r, ext); err != nil {
			return 0, nil, err
		}
		n := binary.BigEndian.Uint64(ext)
		if n > math.MaxInt32 {
			return 0, nil, fmt.Errorf("frame too large")
		}
		length = int(n)
	default:
		length = lengthCode
	}

	mask := make([]byte, 4)
	if masked {
		if _, err = io.ReadFull(r, mask); err != nil {
			return 0, nil, err
		}
	}
	payload = make([]byte, length)
	if length > 0 {
		if _, err = io.ReadFull(r, payload); err != nil {
			return 0, nil, err
		}
	}
	if masked {
		for i := 0; i < len(payload); i++ {
			payload[i] ^= mask[i%4]
		}
	}
	return opcode, payload, nil
}

func headerContainsToken(value, token string) bool {
	for _, part := range strings.Split(value, ",") {
		if strings.EqualFold(strings.TrimSpace(part), token) {
			return true
		}
	}
	return false
}

func isExpectedConnClose(err error) bool {
	if err == io.EOF || strings.Contains(strings.ToLower(err.Error()), "closed network connection") {
		return true
	}
	return false
}

func (s *server) serveStatic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	requestPath := path.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
	if requestPath == "/" {
		requestPath = "/index.html"
	}
	name := strings.TrimPrefix(requestPath, "/")
	if err := s.serveFile(w, r, name); err == nil {
		return
	}
	_ = s.serveFile(w, r, "index.html")
}

func (s *server) serveFile(w http.ResponseWriter, r *http.Request, name string) error {
	f, err := s.webRoot.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fs.ErrNotExist
	}
	if contentType := mime.TypeByExtension(path.Ext(name)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	http.ServeContent(w, r, name, info.ModTime(), mustReadSeeker(f))
	return nil
}

func mustReadSeeker(f fs.File) io.ReadSeeker {
	if rs, ok := f.(io.ReadSeeker); ok {
		return rs
	}
	b, _ := io.ReadAll(f)
	return strings.NewReader(string(b))
}

func openBrowser(url string) {
	if strings.EqualFold(os.Getenv("NO_BROWSER"), "1") || strings.EqualFold(os.Getenv("NO_BROWSER"), "true") {
		return
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Printf("unable to open browser: %v", err)
	}
}

func main() {
	rand.Seed(time.Now().UnixNano())
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8787"
	}
	host := strings.TrimSpace(os.Getenv("HOST"))
	if host == "" {
		host = "0.0.0.0"
	}
	addr := net.JoinHostPort(host, port)

	s := newServer()
	stopCleanup := make(chan struct{})
	go s.cleanupExpiredRooms(stopCleanup)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(s.health())
	})
	mux.HandleFunc("/ws", s.handleWS)
	mux.HandleFunc("/", s.serveStatic)

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		url := "http://127.0.0.1:" + port
		log.Printf("scorched-signal-go listening on %s", addr)
		openBrowser(url)
	}()

	errCh := make(chan error, 1)
	go func() {
		errCh <- httpServer.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		log.Printf("received signal: %s", sig)
		close(stopCleanup)
		_ = httpServer.Close()
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}
}
