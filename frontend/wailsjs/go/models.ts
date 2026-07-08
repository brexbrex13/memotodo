export namespace main {
	
	export class CreateRecurringTaskRequest {
	    title: string;
	    period_type: string;
	    period_value: string;
	    memo: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateRecurringTaskRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.period_type = source["period_type"];
	        this.period_value = source["period_value"];
	        this.memo = source["memo"];
	    }
	}
	export class CreateTodoRequest {
	    title: string;
	    memo: string;
	    deadline: string;
	    reminder_enabled: boolean;
	    reminder_at: string;
	    is_important: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CreateTodoRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.memo = source["memo"];
	        this.deadline = source["deadline"];
	        this.reminder_enabled = source["reminder_enabled"];
	        this.reminder_at = source["reminder_at"];
	        this.is_important = source["is_important"];
	    }
	}
	export class SaveSettingsRequest {
	    notify_times: string[];
	    detail_pattern?: string;
	    recurring_display_days: Record<string, number>;
	    todo_near_deadline_days?: number;
	    reminder_notify_method?: todo.NotifyMethod;
	    periodic_notify_method?: todo.NotifyMethod;
	    image_open_method?: string;

	    static createFrom(source: any = {}) {
	        return new SaveSettingsRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.notify_times = source["notify_times"];
	        this.detail_pattern = source["detail_pattern"];
	        this.recurring_display_days = source["recurring_display_days"];
	        this.todo_near_deadline_days = source["todo_near_deadline_days"];
	        this.reminder_notify_method = this.convertValues(source["reminder_notify_method"], todo.NotifyMethod);
	        this.periodic_notify_method = this.convertValues(source["periodic_notify_method"], todo.NotifyMethod);
	        this.image_open_method = source["image_open_method"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateRecurringTaskRequest {
	    title?: string;
	    memo?: string;
	    period_type?: string;
	    period_value?: string;
	    is_active?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateRecurringTaskRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.memo = source["memo"];
	        this.period_type = source["period_type"];
	        this.period_value = source["period_value"];
	        this.is_active = source["is_active"];
	    }
	}
	export class UpdateTodoRequest {
	    title?: string;
	    memo?: string;
	    deadline?: string;
	    reminder_enabled?: boolean;
	    reminder_at?: string;
	    status?: string;
	    done_at?: string;
	    is_important?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateTodoRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.memo = source["memo"];
	        this.deadline = source["deadline"];
	        this.reminder_enabled = source["reminder_enabled"];
	        this.reminder_at = source["reminder_at"];
	        this.status = source["status"];
	        this.done_at = source["done_at"];
	        this.is_important = source["is_important"];
	    }
	}

}

export namespace todo {
	
	export class Link {
	    type: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new Link(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.value = source["value"];
	    }
	}
	export class NotifyMethod {
	    toast: boolean;
	    bring_to_front: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NotifyMethod(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.toast = source["toast"];
	        this.bring_to_front = source["bring_to_front"];
	    }
	}
	export class RecurringBadge {
	    current: number;
	    overdue: number;
	
	    static createFrom(source: any = {}) {
	        return new RecurringBadge(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.overdue = source["overdue"];
	    }
	}
	export class RecurringTask {
	    id: number;
	    title: string;
	    memo: string;
	    period_type: string;
	    period_value: string;
	    current_deadline: string;
	    status: string;
	    done_at: string;
	    is_active: boolean;
	    created_at: string;
	    freq?: string;
	    is_overdue?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RecurringTask(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.memo = source["memo"];
	        this.period_type = source["period_type"];
	        this.period_value = source["period_value"];
	        this.current_deadline = source["current_deadline"];
	        this.status = source["status"];
	        this.done_at = source["done_at"];
	        this.is_active = source["is_active"];
	        this.created_at = source["created_at"];
	        this.freq = source["freq"];
	        this.is_overdue = source["is_overdue"];
	    }
	}
	export class RecurringPanelData {
	    overdue: RecurringTask[];
	    current: RecurringTask[];
	    badge: RecurringBadge;
	
	    static createFrom(source: any = {}) {
	        return new RecurringPanelData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.overdue = this.convertValues(source["overdue"], RecurringTask);
	        this.current = this.convertValues(source["current"], RecurringTask);
	        this.badge = this.convertValues(source["badge"], RecurringBadge);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Settings {
	    notify_times: string[];
	    detail_pattern: string;
	    recurring_display_days: Record<string, number>;
	    todo_near_deadline_days: number;
	    reminder_notify_method: NotifyMethod;
	    periodic_notify_method: NotifyMethod;
	    image_open_method: string;

	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.notify_times = source["notify_times"];
	        this.detail_pattern = source["detail_pattern"];
	        this.recurring_display_days = source["recurring_display_days"];
	        this.todo_near_deadline_days = source["todo_near_deadline_days"];
	        this.reminder_notify_method = this.convertValues(source["reminder_notify_method"], NotifyMethod);
	        this.periodic_notify_method = this.convertValues(source["periodic_notify_method"], NotifyMethod);
	        this.image_open_method = source["image_open_method"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Todo {
	    id: number;
	    title: string;
	    memo: string;
	    status: string;
	    deadline: string;
	    reminder_enabled: boolean;
	    reminder_at: string;
	    reminded: boolean;
	    created_at: string;
	    done_at: string;
	    is_important: boolean;
	    sort_order: number;
	    is_overdue: boolean;
	    is_near: boolean;
	    links?: Link[];
	
	    static createFrom(source: any = {}) {
	        return new Todo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.memo = source["memo"];
	        this.status = source["status"];
	        this.deadline = source["deadline"];
	        this.reminder_enabled = source["reminder_enabled"];
	        this.reminder_at = source["reminder_at"];
	        this.reminded = source["reminded"];
	        this.created_at = source["created_at"];
	        this.done_at = source["done_at"];
	        this.is_important = source["is_important"];
	        this.sort_order = source["sort_order"];
	        this.is_overdue = source["is_overdue"];
	        this.is_near = source["is_near"];
	        this.links = this.convertValues(source["links"], Link);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

