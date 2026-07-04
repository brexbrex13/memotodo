package main

import "testing"

func TestShouldPushNative(t *testing.T) {
	cases := []struct {
		name                                   string
		visible, minimised, toast, front, want bool
	}{
		{"toast無効なら出さない", true, false, false, false, false},
		{"表示中(非最小化)は抑制", true, false, true, false, false},
		{"表示中でも最小化なら出す", true, true, true, false, true},
		{"非表示なら出す", false, false, true, false, true},
		{"前面化するなら抑制", false, false, true, true, false},
	}
	for _, c := range cases {
		if got := shouldPushNative(c.visible, c.minimised, c.toast, c.front); got != c.want {
			t.Errorf("%s: shouldPushNative(%v,%v,%v,%v)=%v want %v",
				c.name, c.visible, c.minimised, c.toast, c.front, got, c.want)
		}
	}
}
