package todo

import "testing"

// TestGetTodosOrdering は、期日なしタスクが sort_order 昇順、
// 期日ありタスクが deadline 昇順（作成順に依存しない）で並ぶことを検証する。
func TestGetTodosOrdering(t *testing.T) {
	dir := t.TempDir()
	s, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	create := func(title, deadline string) int64 {
		id, err := s.CreateTodo(CreateTodoInput{Title: title, Deadline: deadline})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}

	// 期日なし2件を先に作成（後から作られた方が sort_order が小さくなり先頭に来る）
	noDeadline1 := create("no-deadline-1", "")
	noDeadline2 := create("no-deadline-2", "")

	// 期日あり3件を、作成順と期日順がズレるように投入する
	withDeadline3 := create("with-deadline-2024-03-10", "2024-03-10")
	withDeadline1 := create("with-deadline-2024-01-05", "2024-01-05")
	withDeadline2 := create("with-deadline-2024-02-15", "2024-02-15")

	todos, err := s.GetTodos("pending")
	if err != nil {
		t.Fatal(err)
	}

	var gotIDs []int64
	for _, td := range todos {
		gotIDs = append(gotIDs, td.ID)
	}

	wantIDs := []int64{noDeadline2, noDeadline1, withDeadline1, withDeadline2, withDeadline3}
	if len(gotIDs) != len(wantIDs) {
		t.Fatalf("got %d todos, want %d: %v", len(gotIDs), len(wantIDs), gotIDs)
	}
	for i := range wantIDs {
		if gotIDs[i] != wantIDs[i] {
			t.Errorf("order mismatch at index %d: got %v, want %v", i, gotIDs, wantIDs)
			break
		}
	}
}
