package main

import "testing"

func TestShouldPushNative(t *testing.T) {
	cases := []struct {
		name                            string
		visible, minimised, toast, want bool
	}{
		{"toast無効なら出さない", true, false, false, false},
		{"表示中(非最小化)は抑制", true, false, true, false},
		{"表示中でも最小化なら出す", true, true, true, true},
		{"非表示なら出す", false, false, true, true},
	}
	for _, c := range cases {
		if got := shouldPushNative(c.visible, c.minimised, c.toast); got != c.want {
			t.Errorf("%s: shouldPushNative(%v,%v,%v)=%v want %v",
				c.name, c.visible, c.minimised, c.toast, got, c.want)
		}
	}
}
