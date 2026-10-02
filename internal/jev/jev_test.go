package jev

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func serve(t *testing.T, status int, body string, seen *[]byte, header *http.Header) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if seen != nil {
			*seen, _ = io.ReadAll(r.Body)
		}
		if header != nil {
			*header = r.Header.Clone()
			(*header).Set("X-Path", r.Method+" "+r.URL.Path)
		}
		w.WriteHeader(status)
		io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	c := New("secret-key")
	c.BaseURL = srv.URL
	return c
}

func TestAskSendsWireFormat(t *testing.T) {
	var body []byte
	var header http.Header
	c := serve(t, 200, `{"model":"jev-latest","answers":{"cat":{"type":"choice","choice":"b","confidence":0.9,"probabilities":{"b":0.9}},"imp":{"type":"noul","noul":0.7}}}`, &body, &header)
	got, e := c.Ask(context.Background(), map[string]string{"input": "x"}, map[string]Question{
		"cat": Choice("which", []Option{{Key: "z"}, {Key: "b", Description: "desc"}}),
		"imp": Noul("important", "yes", "no"),
	})
	if e != nil {
		t.Fatal(e)
	}
	if header.Get("Authorization") != "Bearer secret-key" || header.Get("X-Path") != "POST /v1/systemone" {
		t.Fatal(header)
	}
	s := string(body)
	for _, want := range []string{
		`"model":"jev-latest"`,
		`"criteria":{"z":null,"b":"desc"}`,
		`"criteria":{"false":"no","true":"yes"}`,
		`"state":{"input":"x"}`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("%s not in %s", want, s)
		}
	}
	if got["cat"].Choice != "b" || got["cat"].Confidence != 0.9 || got["imp"].Noul != 0.7 {
		t.Fatal(got)
	}
}

func TestChoiceEscapesKeysAndDescriptions(t *testing.T) {
	q := Choice("i", []Option{{Key: "a\"b\\c\n😀"}, {Key: "<x>", Description: "line\n\"q\""}})
	var m map[string]any
	if e := json.Unmarshal(q.Criteria, &m); e != nil {
		t.Fatal(e, string(q.Criteria))
	}
	if _, ok := m["a\"b\\c\n😀"]; !ok || m["<x>"] != "line\n\"q\"" {
		t.Fatal(m)
	}
}

func TestErrorsAreClassified(t *testing.T) {
	cases := []struct {
		status int
		body   string
		want   error
	}{
		{401, `{}`, ErrUnauthorized},
		{403, `{}`, ErrUnauthorized},
		{400, `{"detail":{"error_type":"max_tokens_exceeded"}}`, ErrTooLarge},
	}
	for _, tc := range cases {
		_, e := serve(t, tc.status, tc.body, nil, nil).Ask(context.Background(), "s", map[string]Question{})
		if !errors.Is(e, tc.want) {
			t.Fatal(tc.status, e)
		}
	}
	_, e := serve(t, 500, `oops`, nil, nil).Ask(context.Background(), "s", map[string]Question{})
	if e == nil || errors.Is(e, ErrUnauthorized) || errors.Is(e, ErrTooLarge) {
		t.Fatal(e)
	}
	_, e = serve(t, 200, `not json`, nil, nil).Ask(context.Background(), "s", map[string]Question{})
	if e == nil {
		t.Fatal("bad body accepted")
	}
}

func TestModelsUsesGet(t *testing.T) {
	var header http.Header
	if e := serve(t, 200, `[]`, nil, &header).Models(context.Background()); e != nil {
		t.Fatal(e)
	}
	if header.Get("X-Path") != "GET /v1/models" || header.Get("Authorization") != "Bearer secret-key" {
		t.Fatal(header)
	}
	if e := serve(t, 401, `{}`, nil, nil).Models(context.Background()); !errors.Is(e, ErrUnauthorized) {
		t.Fatal(e)
	}
}

func TestAskHonoursContextDeadline(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
	}))
	defer srv.Close()
	c := New("k")
	c.BaseURL = srv.URL
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, e := c.Ask(ctx, "s", map[string]Question{}); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
}
