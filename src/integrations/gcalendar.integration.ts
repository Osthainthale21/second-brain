import { google, calendar_v3 } from 'googleapis';
import { config } from '../config';
import { vaultService } from '../services/vault.service';
import { logger } from '../utils/logger';

/**
 * GoogleCalendarIntegration - Connect calendar events with knowledge
 *
 * Features:
 * - List upcoming events
 * - Create events from notes
 * - Import meeting notes → Vault
 * - Daily agenda → feed into Daily Digest agent
 */
export class GoogleCalendarIntegration {
  private calendar: calendar_v3.Calendar | null = null;

  constructor() {
    if (config.google.clientId && config.google.clientSecret && config.google.refreshToken) {
      const auth = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
      );
      auth.setCredentials({ refresh_token: config.google.refreshToken });
      this.calendar = google.calendar({ version: 'v3', auth });
    }
  }

  isAvailable(): boolean {
    return this.calendar !== null;
  }

  /**
   * List upcoming events
   */
  async listUpcoming(maxResults: number = 10): Promise<CalendarEvent[]> {
    if (!this.calendar) throw new Error('Google Calendar not configured');

    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map((e) => this.mapEvent(e));
  }

  /**
   * Get today's events (for Daily Digest)
   */
  async getTodaysEvents(): Promise<CalendarEvent[]> {
    if (!this.calendar) throw new Error('Google Calendar not configured');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: todayStart.toISOString(),
      timeMax: todayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map((e) => this.mapEvent(e));
  }

  /**
   * Create a calendar event
   */
  async createEvent(params: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendees?: string[];
  }): Promise<CalendarEvent> {
    if (!this.calendar) throw new Error('Google Calendar not configured');

    const event = await this.calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: params.title,
        description: params.description,
        start: { dateTime: params.startTime },
        end: { dateTime: params.endTime },
        attendees: params.attendees?.map((email) => ({ email })),
      },
    });

    logger.info(`[GCal] Created event: "${params.title}"`);
    return this.mapEvent(event.data);
  }

  /**
   * Create meeting notes → Vault note linked to calendar event
   */
  async createMeetingNote(eventId: string): Promise<{ noteId: string; title: string }> {
    if (!this.calendar) throw new Error('Google Calendar not configured');

    const event = await this.calendar.events.get({
      calendarId: 'primary',
      eventId,
    });

    const data = event.data;
    const title = `Meeting Notes: ${data.summary || 'Untitled'}`;
    const startTime = data.start?.dateTime || data.start?.date || '';
    const attendees = (data.attendees || [])
      .map((a) => `- ${a.displayName || a.email}`)
      .join('\n');

    const content = `## Meeting Notes

**Event:** ${data.summary || 'Untitled'}
**Date:** ${startTime}
**Location:** ${data.location || 'N/A'}

### Attendees
${attendees || '- N/A'}

### Agenda
${data.description || '_No agenda provided_'}

### Notes
_Add your notes here..._

### Action Items
- [ ]

---
_Created from Google Calendar event: ${eventId}_`;

    const note = await vaultService.create({
      title,
      content,
      tags: ['meeting', 'calendar'],
      source: 'api',
    });

    logger.info(`[GCal] Meeting note created: "${title}"`);
    return { noteId: note.frontmatter.id, title };
  }

  /**
   * Get daily agenda as formatted string (for Daily Digest)
   */
  async getDailyAgendaMarkdown(): Promise<string> {
    try {
      const events = await this.getTodaysEvents();
      if (events.length === 0) return '## 📅 Calendar\nNo events today.';

      const lines = events.map((e) => {
        const time = e.startTime
          ? new Date(e.startTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
          : 'All day';
        return `- **${time}** ${e.title}${e.location ? ` (${e.location})` : ''}`;
      });

      return `## 📅 Calendar (${events.length} events)\n${lines.join('\n')}`;
    } catch {
      return '';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapEvent(e: any): CalendarEvent {
    return {
      id: e.id || '',
      title: e.summary || '',
      description: e.description || '',
      startTime: e.start?.dateTime || e.start?.date || '',
      endTime: e.end?.dateTime || e.end?.date || '',
      location: e.location || '',
      attendees: (e.attendees || []).map((a: { email: string }) => a.email),
      htmlLink: e.htmlLink || '',
    };
  }
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location: string;
  attendees: string[];
  htmlLink: string;
}

export const gcalendarIntegration = new GoogleCalendarIntegration();
