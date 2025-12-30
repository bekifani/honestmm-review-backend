import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';

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

  }

  private setupMiddleware() {
    if (!this.io) return;

    // Authentication middleware
    this.io.use(async (socket: any, next) => {
      try {

        // Try multiple sources for the token (handle both direct and proxy scenarios)
        let token = socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
          socket.handshake.query?.token;

        // If no token in auth/headers/query, try to extract from cookies
        if (!token && socket.handshake.headers?.cookie) {
          const cookies = socket.handshake.headers.cookie;

          // Try different cookie formats
          const jwtMatch = cookies.match(/jwt=([^;]+)/) ||
            cookies.match(/accessToken=([^;]+)/) ||
            cookies.match(/token=([^;]+)/);

          if (jwtMatch) {
            token = jwtMatch[1];
          }
        }

        if (!token) {
          return next(new Error('Authentication token required'));
        }



        // Verify JWT token
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;

        // Handle different token structures (some tokens have userInfo nested)
        const userId = decoded.id || decoded.userInfo?.id;

        if (!userId) {
          return next(new Error('Invalid token structure'));
        }

        // Get user from database
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, name: true, email: true }
        });

        if (!user) {
          return next(new Error('User not found'));
        }



        // Attach user info to socket
        socket.userId = user.id;
        socket.userRole = user.role;
        socket.userName = user.name;
        socket.userEmail = user.email;

        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket: AuthenticatedSocket) => {

      // Handle user connections for notifications
      if (socket.userRole === 'USER') {
        socket.join(`user-${socket.userId}`);
      }

      // Handle disconnection
      socket.on('disconnect', (reason) => {
      });

      // Handle connection errors
      socket.on('error', (error) => {
      });

      // Handle ping for connection health
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Handle reconnection events
      socket.on('reconnect', (attemptNumber) => {
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
      });

      socket.on('reconnect_error', (error) => {
      });

      socket.on('reconnect_failed', () => {
      });
    });
  }

  // Emit notification to specific user
  public emitToUser(userId: number, notification: NotificationData) {
    if (!this.io) return;


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
      this.io.close();
      this.adminSockets.clear();
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;
