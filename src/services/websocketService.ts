import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { RealtimeRelay } from './realtimeService';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  userRole?: string;
  userName?: string;
  userEmail?: string;
}

interface NotificationData {
  type: 'general' | 'alert' | 'info' | 'success' | 'warning';
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private adminSockets = new Map<string, AuthenticatedSocket>();
  private activeVoiceRelays = new Map<string, RealtimeRelay>();

  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_ORIGINS?.split(',').map(o => o.trim()) || ["http://localhost:8080"],
        methods: ["GET", "POST"],
        credentials: true
      },
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    console.log('🔌 WebSocket service initialized');
  }

  private setupMiddleware() {
    if (!this.io) return;

    // Authentication middleware
    this.io.use(async (socket: any, next) => {
      try {
        // console.log('🔍 WebSocket auth debug:', {
        //   auth: socket.handshake.auth,
        //   authToken: socket.handshake.auth?.token,
        //   authHeader: socket.handshake.headers?.authorization,
        //   cookies: socket.handshake.headers?.cookie,
        //   query: socket.handshake.query
        // });

        // Try multiple sources for the token (handle both direct and proxy scenarios)
        let token = socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
          socket.handshake.query?.token;

        // If no token in auth/headers/query, try to extract from cookies
        if (!token && socket.handshake.headers?.cookie) {
          const cookies = socket.handshake.headers.cookie;
          // console.log('🍪 Parsing cookies:', cookies);

          // Try different cookie formats
          const jwtMatch = cookies.match(/jwt=([^;]+)/) ||
            cookies.match(/accessToken=([^;]+)/) ||
            cookies.match(/token=([^;]+)/);

          if (jwtMatch) {
            token = jwtMatch[1];
            // console.log('🍪 Found token in cookie:', token.substring(0, 20) + '...');
          }
        }

        if (!token) {
          console.error('❌ No authentication token found in any source');
          return next(new Error('Authentication token required'));
        }

        // console.log('🔐 Attempting to verify token:', token.substring(0, 20) + '...');

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;
        // console.log('✅ Token decoded successfully:', { userId: decoded.id, userInfo: decoded.userInfo });

        // Handle different token structures (some tokens have userInfo nested)
        const userId = decoded.id || decoded.userInfo?.id;

        if (!userId) {
          console.error('❌ No user ID found in token');
          return next(new Error('Invalid token structure'));
        }

        // Get user from database
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, name: true, email: true }
        });

        if (!user) {
          console.error('❌ User not found in database:', userId);
          return next(new Error('User not found'));
        }

        // console.log('👤 User authenticated:', { id: user.id, name: user.name, role: user.role });

        // Attach user info to socket
        socket.userId = user.id;
        socket.userRole = user.role;
        socket.userName = user.name;
        socket.userEmail = user.email;

        next();
      } catch (error) {
        console.error('❌ WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`🔗 User connected: ${socket.userId} (${socket.userRole})`);

      // Handle user connections for notifications
      if (socket.userRole === 'USER') {
        socket.join(`user-${socket.userId}`);
        console.log(`👤 User connected: ${socket.userName}`);
      }

      // Handle Realtime Voice Request
      socket.on('client:start-realtime', async (data: { fileId: number }) => {
        console.log(`🎙️ Voice Listen requested by ${socket.userId} for File: ${data.fileId}`);

        // Clean up any existing relay for this socket to avoid duplicates
        if (this.activeVoiceRelays.has(socket.id)) {
          this.activeVoiceRelays.get(socket.id)?.disconnect();
          this.activeVoiceRelays.delete(socket.id);
        }

        const relay = new RealtimeRelay(socket);
        if (data.fileId) {
          relay.setContext(data.fileId);
        }

        await relay.connect();
        this.activeVoiceRelays.set(socket.id, relay);
      });

      // Handle Barge-In Interruption
      socket.on('client:interrupt', () => {
        if (this.activeVoiceRelays.has(socket.id)) {
          this.activeVoiceRelays.get(socket.id)?.interrupt();
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`🔌 User disconnected: ${socket.userId} - Reason: ${reason}`);

        // Cleanup Voice Relay
        if (this.activeVoiceRelays.has(socket.id)) {
          console.log(`🧹 Cleaning up Voice Relay for ${socket.userId}`);
          this.activeVoiceRelays.get(socket.id)?.disconnect();
          this.activeVoiceRelays.delete(socket.id);
        }
      });

      // Handle connection errors
      socket.on('error', (error) => {
        console.error(`❌ Socket error for user ${socket.userId}:`, error);
      });

      // Handle ping for connection health
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Handle reconnection events
      socket.on('reconnect', (attemptNumber) => {
        console.log(`🔄 User ${socket.userId} reconnected after ${attemptNumber} attempts`);
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔄 User ${socket.userId} attempting reconnection #${attemptNumber}`);
      });

      socket.on('reconnect_error', (error) => {
        console.error(`❌ Reconnection error for user ${socket.userId}:`, error);
      });

      socket.on('reconnect_failed', () => {
        console.error(`❌ Reconnection failed for user ${socket.userId}`);
      });
    });
  }

  // Emit notification to specific user
  public emitToUser(userId: number, notification: NotificationData) {
    if (!this.io) return;

    console.log(`📤 Emitting to user ${userId}: ${notification.type} - ${notification.title}`);

    this.io.to(`user-${userId}`).emit('user-notification', {
      ...notification,
      timestamp: new Date()
    });
  }

  // Send random notification to user
  public sendRandomNotification(userId: number) {
    const notificationTemplates = [
      { type: 'info' as const, title: '📢 New Update', message: 'Check out our latest features!' },
      { type: 'success' as const, title: '✅ Great Job!', message: 'You\'ve completed an action successfully.' },
      { type: 'alert' as const, title: '⚠️ Reminder', message: 'Don\'t forget to verify your account.' },
      { type: 'warning' as const, title: '🔔 Notification', message: 'You have a new message.' },
      { type: 'general' as const, title: '💡 Tip', message: 'Try exploring our new features today!' },
      { type: 'success' as const, title: '🎉 Bonus', message: 'You earned bonus points!' },
      { type: 'info' as const, title: 'ℹ️ Info', message: 'Your profile is 80% complete.' },
      { type: 'alert' as const, title: '⏰ Time Sensitive', message: 'Limited time offer available now!' },
    ];

    // Guard against empty array and ensure index access is safe for TS (noUncheckedIndexedAccess)
    if (notificationTemplates.length === 0) return;
    const idx = Math.floor(Math.random() * notificationTemplates.length);
    const template = notificationTemplates[idx];
    if (!template) return;

    const notification: NotificationData = {
      type: template.type,
      title: template.title,
      message: template.message,
      data: { randomId: Math.random() },
      timestamp: new Date()
    };

    this.emitToUser(userId, notification);
  }


  // Get connection status
  public getStatus() {
    return {
      isInitialized: !!this.io,
      adminConnections: this.adminSockets.size,
      totalConnections: this.io?.engine.clientsCount || 0
    };
  }

  // Graceful shutdown
  public shutdown() {
    if (this.io) {
      console.log('🔌 Shutting down WebSocket service...');
      this.io.close();
      this.adminSockets.clear();
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;
