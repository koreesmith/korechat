package bnc

import (
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/koree/korechat/internal/networks"
)

// makeTestConn builds a minimal Conn with no live TCP connection.
// nick and username populate the IRC identity; userID enables logFn calls.
func makeTestConn(nick, username, userID string) *Conn {
	store := networks.NewStore()
	n := &networks.Network{
		Nick:     nick,
		Username: username,
		Realname: nick,
		Host:     "irc.test",
		Port:     6667,
		Name:     "TestNet",
		UserID:   userID,
	}
	store.Add(n) // sets n.ID, fills Username/Realname defaults if empty
	mgr := &Manager{store: store, conns: make(map[string]*Conn)}
	return newConn(n, store, mgr, nil)
}

// captureConn attaches a log function and a subscriber to c and returns
// slices (shared via pointer) that accumulate every logged and fanned line.
func captureConn(c *Conn) (logged, fanned *[]string) {
	logged = &[]string{}
	fanned = &[]string{}

	c.logFn = func(_, _, _, rawLine string) {
		*logged = append(*logged, rawLine)
	}

	var mu sync.Mutex
	c.subs["test-sub"] = &subscriber{id: "test-sub", send: func(line string) {
		mu.Lock()
		*fanned = append(*fanned, line)
		mu.Unlock()
	}}
	return
}

// ─── selfEcho tests ───────────────────────────────────────────────────────────

func TestSelfEcho_ChannelPrivmsg(t *testing.T) {
	c := makeTestConn("Alice", "alice", "uid-1")
	logged, fanned := captureConn(c)

	before := time.Now()
	c.selfEcho("PRIVMSG #general :hello world")
	after := time.Now()

	if len(*logged) != 1 {
		t.Fatalf("expected 1 logged line, got %d", len(*logged))
	}
	if len(*fanned) != 1 {
		t.Fatalf("expected 1 fanned line, got %d", len(*fanned))
	}

	line := (*logged)[0]
	if !strings.HasPrefix(line, "@time=") {
		t.Errorf("expected @time= tag prefix: %q", line)
	}
	if !strings.Contains(line, ":Alice!alice@korechat PRIVMSG #general :hello world") {
		t.Errorf("unexpected line body: %q", line)
	}

	ts := parseTimeTag(line)
	if ts.Before(before) || ts.After(after.Add(time.Second)) {
		t.Errorf("timestamp %v out of range [%v, %v]", ts, before, after)
	}

	c.mu.Lock()
	buf := c.buffers["#general"]
	c.mu.Unlock()
	if buf == nil || buf.n == 0 {
		t.Error("expected message buffered in #general ring buffer")
	}
}

func TestSelfEcho_ChannelNotice(t *testing.T) {
	c := makeTestConn("Alice", "alice", "uid-1")
	logged, _ := captureConn(c)

	c.selfEcho("NOTICE #ops :server restart in 5 minutes")

	if len(*logged) != 1 {
		t.Fatalf("expected 1 logged line, got %d", len(*logged))
	}
	if !strings.Contains((*logged)[0], ":Alice!alice@korechat NOTICE #ops :server restart in 5 minutes") {
		t.Errorf("unexpected line: %q", (*logged)[0])
	}
}

func TestSelfEcho_SkipsDM(t *testing.T) {
	c := makeTestConn("Alice", "alice", "uid-1")
	logged, fanned := captureConn(c)

	c.selfEcho("PRIVMSG Bob :private message")

	if len(*logged) != 0 {
		t.Errorf("DM should not be logged, got: %v", *logged)
	}
	if len(*fanned) != 0 {
		t.Errorf("DM should not be fanned, got: %v", *fanned)
	}
}

func TestSelfEcho_SkipsNonMessageCommands(t *testing.T) {
	c := makeTestConn("Alice", "alice", "uid-1")
	logged, _ := captureConn(c)

	for _, cmd := range []string{
		"JOIN #channel",
		"PART #channel",
		"NICK newnick",
		"QUIT :bye",
		"MODE #chan +m",
	} {
		c.selfEcho(cmd)
	}

	if len(*logged) != 0 {
		t.Errorf("non-message commands should not be logged, got: %v", *logged)
	}
}

func TestSelfEcho_AmpersandChannel(t *testing.T) {
	c := makeTestConn("Alice", "alice", "uid-1")
	logged, _ := captureConn(c)

	c.selfEcho("PRIVMSG &local :hello")

	if len(*logged) != 1 {
		t.Fatalf("expected 1 logged line for &channel, got %d", len(*logged))
	}
	if !strings.Contains((*logged)[0], "PRIVMSG &local :hello") {
		t.Errorf("unexpected line: %q", (*logged)[0])
	}
}

func TestSelfEcho_NoLogWhenUserIDEmpty(t *testing.T) {
	c := makeTestConn("Alice", "alice", "") // empty userID
	logged, fanned := captureConn(c)

	c.selfEcho("PRIVMSG #test :message")

	// fanOut still happens, but logFn should not be called
	if len(*fanned) != 1 {
		t.Errorf("expected 1 fanned line, got %d", len(*fanned))
	}
	if len(*logged) != 0 {
		t.Errorf("logFn should not be called with empty userID, got: %v", *logged)
	}
}

// ─── Send() echo-message gate tests ──────────────────────────────────────────

// pipeConn sets a net.Pipe() pair on c.tcpConn and returns a drain function.
// Call drain() in a goroutine to prevent Send()'s write from blocking.
func pipeConn(t *testing.T, c *Conn) (drain func()) {
	t.Helper()
	server, client := net.Pipe()
	c.mu.Lock()
	c.tcpConn = client
	c.mu.Unlock()

	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			if _, err := server.Read(buf); err != nil {
				return
			}
		}
	}()

	t.Cleanup(func() {
		server.Close()
		client.Close()
		<-done
	})

	return func() {} // drain goroutine is always running
}

func TestSend_SelfEchoWhenNoEchoMessage(t *testing.T) {
	c := makeTestConn("Alice", "alice", "uid-1")
	logged, _ := captureConn(c)
	pipeConn(t, c)

	c.Send("PRIVMSG #test :hello")

	if len(*logged) != 1 {
		t.Fatalf("expected self-echo when echo-message not acked, got %d logged lines", len(*logged))
	}
	if !strings.Contains((*logged)[0], "PRIVMSG #test :hello") {
		t.Errorf("unexpected self-echo content: %q", (*logged)[0])
	}
}

func TestSend_NoSelfEchoWhenEchoMessageAcked(t *testing.T) {
	c := makeTestConn("Alice", "alice", "uid-1")
	logged, _ := captureConn(c)
	pipeConn(t, c)

	c.mu.Lock()
	c.ackedCaps["echo-message"] = true
	c.mu.Unlock()

	c.Send("PRIVMSG #test :hello")

	if len(*logged) != 0 {
		t.Errorf("expected no self-echo when echo-message is acked, got: %v", *logged)
	}
}

func TestSend_NoSelfEchoWhenNotConnected(t *testing.T) {
	c := makeTestConn("Alice", "alice", "uid-1")
	logged, _ := captureConn(c)
	// tcpConn is nil — simulates disconnected state

	c.Send("PRIVMSG #test :hello")

	if len(*logged) != 0 {
		t.Errorf("expected no self-echo when not connected, got: %v", *logged)
	}
}
