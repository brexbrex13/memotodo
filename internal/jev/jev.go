// Package jev is a minimal client for TypeSafe AI's Jev decision model.
package jev

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

var (
	ErrUnauthorized = errors.New("jev: unauthorized")
	ErrTooLarge     = errors.New("jev: request too large")
)

type Option struct{ Key, Description string }

type Question struct {
	Type         string          `json:"type"`
	Instructions string          `json:"instructions"`
	Criteria     json.RawMessage `json:"criteria,omitempty"`
}

// Noul criteria must be nested; top-level true/false are silently ignored by the API.
func Noul(instructions, whenTrue, whenFalse string) Question {
	b, _ := json.Marshal(map[string]string{"true": whenTrue, "false": whenFalse})
	return Question{Type: "noul", Instructions: instructions, Criteria: b}
}

// Choice keeps option order, which affects answers when there are few options.
// An empty description is sent as null so the option is judged by its name.
func Choice(instructions string, options []Option) Question {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, o := range options {
		if i > 0 {
			b.WriteByte(',')
		}
		k, _ := json.Marshal(o.Key)
		b.Write(k)
		b.WriteByte(':')
		if o.Description == "" {
			b.WriteString("null")
		} else {
			d, _ := json.Marshal(o.Description)
			b.Write(d)
		}
	}
	b.WriteByte('}')
	return Question{Type: "choice", Instructions: instructions, Criteria: b.Bytes()}
}

type Answer struct {
	Type          string             `json:"type"`
	Noul          float64            `json:"noul"`
	Choice        string             `json:"choice"`
	Confidence    float64            `json:"confidence"`
	Score         float64            `json:"score"`
	Probabilities map[string]float64 `json:"probabilities"`
}

type Client struct {
	BaseURL string
	Key     string
	Model   string
	HTTP    *http.Client
}

func New(key string) *Client {
	return &Client{BaseURL: "https://api.typesafe.ai", Key: key, Model: "jev-latest", HTTP: http.DefaultClient}
}

func (c *Client) Ask(ctx context.Context, state any, questions map[string]Question) (map[string]Answer, error) {
	body, e := json.Marshal(map[string]any{"model": c.Model, "state": state, "questions": questions})
	if e != nil {
		return nil, e
	}
	var out struct {
		Answers map[string]Answer `json:"answers"`
	}
	if e = c.do(ctx, http.MethodPost, "/v1/systemone", body, &out); e != nil {
		return nil, e
	}
	return out.Answers, nil
}

func (c *Client) Models(ctx context.Context) error {
	return c.do(ctx, http.MethodGet, "/v1/models", nil, nil)
}

func (c *Client) do(ctx context.Context, method, path string, body []byte, out any) error {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, e := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, reader)
	if e != nil {
		return e
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, e := c.HTTP.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	b, e := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if e != nil {
		return e
	}
	switch {
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return ErrUnauthorized
	case res.StatusCode == http.StatusBadRequest && bytes.Contains(b, []byte("max_tokens_exceeded")):
		return ErrTooLarge
	case res.StatusCode/100 != 2:
		return fmt.Errorf("jev: HTTP %d: %s", res.StatusCode, b[:min(len(b), 200)])
	}
	if out == nil {
		return nil
	}
	if e = json.Unmarshal(b, out); e != nil {
		return fmt.Errorf("jev: bad response: %w", e)
	}
	return nil
}
