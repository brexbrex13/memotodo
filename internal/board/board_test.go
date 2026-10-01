package board

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func at(v string) time.Time {
	t, e := ParseTime(v, time.Local)
	if e != nil {
		panic(e)
	}
	return t
}
func setup(t *testing.T, when string) *Store {
	t.Helper()
	s, e := Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	s.now = func() time.Time { return at(when) }
	t.Cleanup(func() { s.Close() })
	settings := Defaults()
	settings.NotifyTimes = []string{}
	if e = s.SaveSettings(settings); e != nil {
		t.Fatal(e)
	}
	return s
}
func snap(t *testing.T, s *Store) Snapshot {
	t.Helper()
	v, e := s.Snapshot()
	if e != nil {
		t.Fatal(e)
	}
	return v
}
func tick(t *testing.T, s *Store, when string) {
	t.Helper()
	if _, e := s.Tick(at(when), false); e != nil {
		t.Fatal(e)
	}
}
func weekly() Series {
	return Series{Title: "水曜までに実施", Period: "weekly", Interval: 1, Weekdays: []int{3}, Month: 1, MonthDay: 1, FirstDue: "2026-09-30", ShowDays: 7, NearDays: 3, NotifyMode: "days", NotifyDays: 1, NotifyTime: "09:00", Active: true}
}
func TestRecurringAccumulatesIdempotently(t *testing.T) {
	s := setup(t, "2026-09-29T09:05")
	v, e := s.SaveSeries(weekly())
	if e != nil {
		t.Fatal(e)
	}
	tick(t, s, "2026-09-29T09:05")
	a := snap(t, s)
	if len(a.Tasks) != 1 || a.Tasks[0].Deadline != "2026-09-30" || a.Tasks[0].ReminderAt != "2026-09-29T09:00:00" {
		t.Fatalf("%+v", a.Tasks)
	}
	if len(a.Notifications) != 1 {
		t.Fatal(a.Notifications)
	}
	tick(t, s, "2026-10-07T09:05")
	tick(t, s, "2026-10-07T09:05")
	a = snap(t, s)
	if len(a.Tasks) != 3 {
		t.Fatalf("uncompleted periods must accumulate: %+v", a.Tasks)
	}
	if len(a.Notifications) != 2 {
		t.Fatal(a.Notifications)
	}
	if a.Series[0].Version != v.Version {
		t.Fatal("cursor changed template version")
	}
	if e = s.SetState(a.Tasks[0].ID, "done"); e != nil {
		t.Fatal(e)
	}
	tick(t, s, "2026-10-07T09:06")
	a = snap(t, s)
	if !a.Notifications[0].Acknowledged || a.Tasks[1].Status != "pending" {
		t.Fatal(a)
	}
}
func TestPauseResumeAndTemplateEdit(t *testing.T) {
	s := setup(t, "2026-09-29T10:00")
	_, e := s.SaveSeries(weekly())
	if e != nil {
		t.Fatal(e)
	}
	tick(t, s, "2026-09-29T10:00")
	v := snap(t, s).Series[0]
	v.Active = false
	if _, e = s.SaveSeries(v); e != nil {
		t.Fatal(e)
	}
	tick(t, s, "2026-10-22T10:00")
	if len(snap(t, s).Tasks) != 1 {
		t.Fatal("generated during pause")
	}
	s.now = func() time.Time { return at("2026-10-22T10:00") }
	v = snap(t, s).Series[0]
	v.Active = true
	v.Title = "変更した将来の付箋"
	if _, e = s.SaveSeries(v); e != nil {
		t.Fatal(e)
	}
	tick(t, s, "2026-10-22T10:00")
	a := snap(t, s)
	if len(a.Tasks) != 2 || a.Tasks[0].Title != "水曜までに実施" || a.Tasks[1].Occurrence != "2026-10-28" || a.Tasks[1].Title != v.Title {
		t.Fatal(a.Tasks)
	}
}
func TestMonthEndsLeapYearAndWeekIntervals(t *testing.T) {
	cases := []struct {
		s          Series
		from, want string
	}{{Series{Period: "monthly", Interval: 1, MonthDay: 31}, "2026-01-31", "2026-02-28"}, {Series{Period: "monthly", Interval: 1, MonthDay: 31}, "2026-02-28", "2026-03-31"}, {Series{Period: "yearly", Interval: 1, Month: 2, MonthDay: 29}, "2027-02-28", "2028-02-29"}, {Series{Period: "weekly", Interval: 2, FirstDue: "2026-09-28", Weekdays: []int{1, 3}}, "2026-09-30", "2026-10-12"}, {Series{Period: "weekly", Interval: 1, FirstDue: "2026-09-30", Weekdays: []int{3}}, "2026-09-30", "2026-10-07"}}
	for _, c := range cases {
		if got := Date(nextDue(c.s, at(c.from))); got != c.want {
			t.Fatalf("%s -> %s want %s", c.from, got, c.want)
		}
	}
}
func TestHoursBeforeDifferentFromPreviousDay(t *testing.T) {
	s := setup(t, "2026-09-29T10:00")
	v := weekly()
	v.NotifyMode = "hours"
	v.NotifyHours = 24
	_, e := s.SaveSeries(v)
	if e != nil {
		t.Fatal(e)
	}
	tick(t, s, "2026-09-29T10:00")
	if got := snap(t, s).Tasks[0].ReminderAt; got != "2026-09-29T23:59:59" {
		t.Fatal(got)
	}
}
func TestNotificationRestartAcknowledgeSnoozeAndReopen(t *testing.T) {
	dir := t.TempDir()
	s, e := Open(dir)
	if e != nil {
		t.Fatal(e)
	}
	settings := Defaults()
	settings.NotifyTimes = []string{}
	s.SaveSettings(settings)
	s.now = func() time.Time { return at("2026-10-01T10:00") }
	task, e := s.SaveTask(Task{Title: "reminder", ReminderAt: "2026-10-01T09:00"})
	if e != nil {
		t.Fatal(e)
	}
	tick(t, s, "2026-10-01T10:00")
	s.Close()
	s, e = Open(dir)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	s.now = func() time.Time { return at("2026-10-01T10:00") }
	tick(t, s, "2026-10-01T10:00")
	a := snap(t, s)
	if len(a.Notifications) != 1 || a.Notifications[0].Acknowledged {
		t.Fatal(a)
	}
	s.Acknowledge(a.Notifications[0].ID)
	if snap(t, s).Tasks[0].Status != "pending" {
		t.Fatal("ack must not complete task")
	}
	if e = s.Snooze(a.Notifications[0].ID, "2026-10-01T10:10"); e != nil {
		t.Fatal(e)
	}
	tick(t, s, "2026-10-01T10:09")
	if len(snap(t, s).Notifications) != 1 {
		t.Fatal("early snooze")
	}
	tick(t, s, "2026-10-01T10:11")
	if len(snap(t, s).Notifications) != 2 {
		t.Fatal("lost snooze")
	}
	s.SetState(task.ID, "done")
	tick(t, s, "2026-10-01T10:12")
	for _, n := range snap(t, s).Notifications {
		if !n.Acknowledged {
			t.Fatal("completed task notice visible")
		}
	}
	s.SetState(task.ID, "pending")
	if snap(t, s).Tasks[0].ReminderAt != "" {
		t.Fatal("old reminder survives reopen")
	}
}
func TestVersionConflictCategoryTrashAndOrder(t *testing.T) {
	s := setup(t, "2026-10-01T10:00")
	c, e := s.SaveCategory(Category{Name: "今期", Color: "#abcdef"})
	if e != nil {
		t.Fatal(e)
	}
	a, e := s.SaveTask(Task{Title: "a", CategoryID: c.ID})
	if e != nil {
		t.Fatal(e)
	}
	b, _ := s.SaveTask(Task{Title: "b"})
	a.Title = "changed"
	if _, e = s.SaveTask(a); e != nil {
		t.Fatal(e)
	}
	if _, e = s.SaveTask(a); e == nil {
		t.Fatal("stale writer allowed")
	}
	if e = s.Reorder([]int64{b.ID, a.ID}); e != nil {
		t.Fatal(e)
	}
	s.SetState(a.ID, "trash")
	if snap(t, s).Tasks[0].DeletedAt == "" {
		t.Fatal("trash missing")
	}
	s.SetState(a.ID, "restore")
	s.DeleteCategory(c.ID)
	v := snap(t, s)
	if v.Tasks[0].Title != "changed" || v.Tasks[0].CategoryID != 0 || v.Tasks[0].DeletedAt != "" {
		t.Fatal(v.Tasks)
	}
}
func TestDateOnlyDeadlineAndWorkdays(t *testing.T) {
	v := Defaults()
	v.NearDays = 1
	task := Task{Status: "pending", Deadline: "2026-10-05"}
	if Urgency(task, at("2026-10-02T12:00"), v) != "near" {
		t.Fatal("Monday should be next working day")
	}
	v.Workdays = false
	if Urgency(task, at("2026-10-02T12:00"), v) != "" {
		t.Fatal("calendar day mismatch")
	}
	task.Deadline = "2026-10-01"
	if Urgency(task, at("2026-10-01T23:59"), v) != "today" || Urgency(task, at("2026-10-02T00:00"), v) != "overdue" {
		t.Fatal("date deadline not end of day")
	}
}
func TestSummaryCatchesLatestSlotOnly(t *testing.T) {
	s := setup(t, "2026-10-01T18:00")
	v := Defaults()
	v.NotifyTimes = []string{"13:00", "17:00"}
	s.SaveSettings(v)
	s.SaveTask(Task{Title: "overdue", Deadline: "2026-09-30"})
	tick(t, s, "2026-10-01T18:00")
	tick(t, s, "2026-10-01T18:00")
	ns := snap(t, s).Notifications
	if len(ns) != 1 || ns[0].Key != "summary:2026-10-01:17:00" {
		t.Fatal(ns)
	}
}
func TestBackupIncludesImagesAndDoesNotTouchLegacy(t *testing.T) {
	s := setup(t, "2026-10-01T10:00")
	os.WriteFile(filepath.Join(s.Dir, "todo.db"), []byte("legacy"), 0600)
	os.WriteFile(filepath.Join(s.Dir, "images", "example.png"), []byte("image-bytes"), 0600)
	s.SaveTask(Task{Title: "backup", Memo: `<img src="/images/example.png">`})
	path, e := s.Backup()
	if e != nil {
		t.Fatal(e)
	}
	z, e := zip.OpenReader(path)
	if e != nil {
		t.Fatal(e)
	}
	defer z.Close()
	names := map[string]bool{}
	for _, f := range z.File {
		names[f.Name] = true
		if f.Name == "board.json" {
			r, _ := f.Open()
			var dump map[string]any
			if e = json.NewDecoder(r).Decode(&dump); e != nil {
				t.Fatal(e)
			}
			r.Close()
			if dump["format"] != "memotodo-board-v3" {
				t.Fatal(dump)
			}
		}
	}
	if !names["board.json"] || !names["images/example.png"] {
		t.Fatal(names)
	}
	b, _ := os.ReadFile(filepath.Join(s.Dir, "todo.db"))
	if string(b) != "legacy" {
		t.Fatal("legacy changed")
	}
}
func TestInvalidSeriesDoesNotCreateRows(t *testing.T) {
	s := setup(t, "2026-10-01T10:00")
	v := weekly()
	v.ShowDays = 0
	if _, e := s.SaveSeries(v); e == nil {
		t.Fatal("reminder before generation allowed")
	}
	if len(snap(t, s).Series) != 0 {
		t.Fatal("invalid series created")
	}
}

func TestRestoreRoundtripAndTraversalRollback(t *testing.T) {
	s := setup(t, "2026-10-01T10:00")
	task, _ := s.SaveTask(Task{Title: "kept", Memo: `<img src="/images/a.png">`})
	os.WriteFile(filepath.Join(s.Dir, "images", "a.png"), []byte("old-image"), 0600)
	path, e := s.Backup()
	if e != nil {
		t.Fatal(e)
	}
	data, _ := os.ReadFile(path)
	s.SetState(task.ID, "trash")
	os.WriteFile(filepath.Join(s.Dir, "images", "a.png"), []byte("new-image"), 0600)
	if e = s.Restore(data); e != nil {
		t.Fatal(e)
	}
	v := snap(t, s)
	if v.Tasks[0].DeletedAt != "" || v.Tasks[0].Title != "kept" || v.Tasks[0].Memo == task.Memo {
		t.Fatal(v.Tasks)
	}
	old, _ := os.ReadFile(filepath.Join(s.Dir, "images", "a.png"))
	if string(old) != "new-image" {
		t.Fatal("existing attachment overwritten")
	}
	var bad bytes.Buffer
	z := zip.NewWriter(&bad)
	f, _ := z.Create("images/../../escape")
	f.Write([]byte("x"))
	z.Close()
	if e = s.Restore(bad.Bytes()); e == nil {
		t.Fatal("traversal accepted")
	}
	if snap(t, s).Tasks[0].Title != "kept" {
		t.Fatal("failed restore modified data")
	}
}
