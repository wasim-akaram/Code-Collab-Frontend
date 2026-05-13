import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { Client, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { environment } from '../../../environments/environment';

// ─── Model Types ──────────────────────────────────────────────────────────────

export interface CollabSession {
  sessionId: string;
  projectId: number;
  fileId: number;
  ownerEmail?: string;
  status: string;
  language?: string;
  maxParticipants?: number;
  isPasswordProtected?: boolean;
  participantCount?: number;
  createdAt?: string;
  endedAt?: string;
}

export interface CollabParticipant {
  participantId?: number;
  sessionId: string;
  userEmail: string;
  role: string;       // HOST | EDITOR | VIEWER
  cursorLine?: number;
  cursorCol?: number;
  color?: string;
  joinedAt?: string;
  leftAt?: string;
}

export interface CursorUpdate {
  userEmail: string;
  color?: string;
  line: number;
  col: number;
}

export interface EditDelta {
  userEmail: string;
  delta?: string;
  content?: string;
  timestamp?: number;
}

export interface ParticipantEvent {
  userEmail: string;
  action: 'joined' | 'left' | 'kicked';
  color?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CollabService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/sessions`;
  // WebSocket endpoint — routed through the API Gateway which proxies to collab-service
  private wsUrl   = 'http://localhost:8084/ws-collab';   // Direct: SockJS to collab-service

  // STOMP client
  private stompClient: Client | null = null;
  private subscriptions: StompSubscription[] = [];

  // Observable streams for real-time events
  readonly cursorUpdates$ = new Subject<CursorUpdate>();
  readonly editEvents$    = new Subject<EditDelta>();
  readonly participantEvents$ = new Subject<ParticipantEvent>();
  readonly connectionState$ = new Subject<'connected' | 'disconnected' | 'error'>();

  // ─── REST API ───────────────────────────────────────────────────────────────

  createSession(dto: Partial<CollabSession> & { sessionPassword?: string }): Observable<CollabSession> {
    return this.http.post<CollabSession>(this.baseUrl, dto);
  }

  getSession(sessionId: string): Observable<CollabSession> {
    return this.http.get<CollabSession>(`${this.baseUrl}/${sessionId}`);
  }

  getActiveSessionsByProject(projectId: number): Observable<CollabSession[]> {
    return this.http.get<CollabSession[]>(`${this.baseUrl}/project/${projectId}/active`);
  }

  getAllSessionsByProject(projectId: number): Observable<CollabSession[]> {
    return this.http.get<CollabSession[]>(`${this.baseUrl}/project/${projectId}`);
  }

  joinSession(sessionId: string, password?: string): Observable<CollabParticipant> {
    return this.http.post<CollabParticipant>(
      `${this.baseUrl}/${sessionId}/join`,
      password ? { password } : {}
    );
  }

  leaveSession(sessionId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${sessionId}/leave`, {});
  }

  endSession(sessionId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${sessionId}/end`, {});
  }

  kickParticipant(sessionId: string, targetEmail: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${sessionId}/kick/${encodeURIComponent(targetEmail)}`, {});
  }

  getParticipants(sessionId: string): Observable<CollabParticipant[]> {
    return this.http.get<CollabParticipant[]>(`${this.baseUrl}/${sessionId}/participants`);
  }

  // ─── WebSocket (STOMP/SockJS) ────────────────────────────────────────────────

  connectToSession(sessionId: string): void {
    if (this.stompClient?.active) {
      this.disconnectFromSession();
    }

    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(this.wsUrl) as WebSocket,
      reconnectDelay: 5000,
      onConnect: () => {
        this.connectionState$.next('connected');
        this.subscribeToSession(sessionId);
      },
      onDisconnect: () => {
        this.connectionState$.next('disconnected');
      },
      onStompError: (frame) => {
        console.error('STOMP error', frame);
        this.connectionState$.next('error');
      }
    });

    this.stompClient.activate();
  }

  private subscribeToSession(sessionId: string): void {
    if (!this.stompClient) return;

    // Subscribe to cursor updates
    const cursorSub = this.stompClient.subscribe(
      `/topic/session/${sessionId}/cursor`,
      (msg) => {
        try { this.cursorUpdates$.next(JSON.parse(msg.body)); } catch {}
      }
    );

    // Subscribe to edit events
    const editSub = this.stompClient.subscribe(
      `/topic/session/${sessionId}/edit`,
      (msg) => {
        try { this.editEvents$.next(JSON.parse(msg.body)); } catch {}
      }
    );

    // Subscribe to participant events
    const participantSub = this.stompClient.subscribe(
      `/topic/session/${sessionId}/participants`,
      (msg) => {
        try { this.participantEvents$.next(JSON.parse(msg.body)); } catch {}
      }
    );

    this.subscriptions = [cursorSub, editSub, participantSub];
  }

  disconnectFromSession(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    this.stompClient?.deactivate();
    this.stompClient = null;
  }

  sendCursorUpdate(sessionId: string, userEmail: string, color: string, line: number, col: number): void {
    this.stompClient?.publish({
      destination: `/app/session/${sessionId}/cursor`,
      body: JSON.stringify({ userEmail, color, line, col })
    });
  }

  sendEditDelta(sessionId: string, userEmail: string, content: string): void {
    this.stompClient?.publish({
      destination: `/app/session/${sessionId}/edit`,
      body: JSON.stringify({ userEmail, content, timestamp: Date.now() })
    });
  }

  announceJoin(sessionId: string, userEmail: string, color: string): void {
    this.stompClient?.publish({
      destination: `/app/session/${sessionId}/join`,
      body: JSON.stringify({ userEmail, action: 'joined', color })
    });
  }

  announceLeave(sessionId: string, userEmail: string): void {
    this.stompClient?.publish({
      destination: `/app/session/${sessionId}/leave`,
      body: JSON.stringify({ userEmail, action: 'left' })
    });
  }
}
