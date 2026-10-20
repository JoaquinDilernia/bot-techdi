import { describe, it, expect } from 'vitest';
import { waitLevel, avatarColor, statusPill, AVATAR_PALETTE, resolveAssignee, pillFor, initials, listTime } from './conversationView.js';

describe('waitLevel', () => {
  it('umbrales 5 y 15 minutos', () => {
    expect(waitLevel(null)).toBe('none');
    expect(waitLevel(undefined)).toBe('none');
    expect(waitLevel(0)).toBe('ok');
    expect(waitLevel(4.9)).toBe('ok');
    expect(waitLevel(5)).toBe('warn');
    expect(waitLevel(14.9)).toBe('warn');
    expect(waitLevel(15)).toBe('late');
    expect(waitLevel(120)).toBe('late');
  });
});

describe('avatarColor', () => {
  it('es estable y sale de la paleta de 8', () => {
    expect(avatarColor('5492994000000')).toBe(avatarColor('5492994000000'));
    expect(AVATAR_PALETTE).toEqual(['#7c3aed', '#e8473f', '#0ea5e9', '#f59e0b', '#16a34a', '#db2777', '#0f766e', '#6366f1']);
    for (const s of ['a', 'b', 'Juan', '5491100000000', '', null, undefined]) {
      expect(AVATAR_PALETTE).toContain(avatarColor(s));
    }
  });
  it('reparte distintos seeds en más de un color', () => {
    const colors = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('statusPill', () => {
  it('bot', () => {
    expect(statusPill({ status: 'bot' }, { botName: 'TeDi' })).toEqual({ text: 'TeDi respondiendo', tone: 'bot' });
  });
  it('escalated sin humanMode', () => {
    expect(statusPill({ status: 'escalated', humanMode: false }, { botName: 'TeDi', areaName: 'Ventas' })).toEqual({ text: 'Esperando · Ventas', tone: 'wait' });
    expect(statusPill({ status: 'escalated', humanMode: false }, { botName: 'TeDi' })).toEqual({ text: 'Esperando', tone: 'wait' });
  });
  it('humanMode', () => {
    expect(statusPill({ status: 'escalated', humanMode: true }, { botName: 'TeDi', agentName: 'Joaquín' })).toEqual({ text: 'Joaquín', tone: 'agent' });
    expect(statusPill({ status: 'escalated', humanMode: true }, { botName: 'TeDi' })).toEqual({ text: 'Equipo', tone: 'agent' });
  });
  it('resolved y bot_archived', () => {
    expect(statusPill({ status: 'resolved' }, { botName: 'TeDi' })).toEqual({ text: 'Resuelta', tone: 'ok' });
    expect(statusPill({ status: 'bot_archived' }, { botName: 'TeDi' })).toEqual({ text: 'Archivada', tone: 'muted' });
  });
  it('sin botName usa "Bot"', () => {
    expect(statusPill({ status: 'bot' }, {})).toEqual({ text: 'Bot respondiendo', tone: 'bot' });
  });
});

describe('resolveAssignee', () => {
  const areas = [{ id: 'a1', name: 'Ventas' }];
  const nameMap = { a1: 'Ventas', 'jo@x.com': 'Joaquín', u7: 'Joaquín' };
  it('distingue área de agente', () => {
    expect(resolveAssignee('a1', { areas, nameMap })).toEqual({ areaName: 'Ventas', agentName: null });
    expect(resolveAssignee('jo@x.com', { areas, nameMap })).toEqual({ areaName: null, agentName: 'Joaquín' });
    expect(resolveAssignee('u7', { areas, nameMap })).toEqual({ areaName: null, agentName: 'Joaquín' });
    expect(resolveAssignee('otro@x.com', { areas, nameMap })).toEqual({ areaName: null, agentName: 'otro@x.com' });
    expect(resolveAssignee(null, { areas, nameMap })).toEqual({ areaName: null, agentName: null });
  });
});

describe('pillFor (datos reales: el backend escala con humanMode=true)', () => {
  const ctx = { botName: 'TeDi', areas: [{ id: 'a1', name: 'Ventas' }], nameMap: { 'jo@x.com': 'Joaquín' } };
  it('derivada a un área sin agente → Esperando · área', () => {
    expect(pillFor({ status: 'escalated', humanMode: true, assignedTo: 'a1' }, ctx)).toEqual({ text: 'Esperando · Ventas', tone: 'wait' });
  });
  it('escalada sin asignar → Esperando', () => {
    expect(pillFor({ status: 'escalated', humanMode: true, assignedTo: null }, ctx)).toEqual({ text: 'Esperando', tone: 'wait' });
  });
  it('tomada por un agente → nombre', () => {
    expect(pillFor({ status: 'escalated', humanMode: true, assignedTo: 'jo@x.com' }, ctx)).toEqual({ text: 'Joaquín', tone: 'agent' });
  });
  it('bot, resuelta y archivada', () => {
    expect(pillFor({ status: 'bot', humanMode: false }, ctx)).toEqual({ text: 'TeDi respondiendo', tone: 'bot' });
    expect(pillFor({}, ctx)).toEqual({ text: 'TeDi respondiendo', tone: 'bot' });
    expect(pillFor({ status: 'resolved', assignedTo: 'jo@x.com' }, ctx)).toEqual({ text: 'Resuelta', tone: 'ok' });
    expect(pillFor({ status: 'bot_archived' }, ctx)).toEqual({ text: 'Archivada', tone: 'muted' });
  });
});

describe('initials', () => {
  it('toma hasta 2 iniciales', () => {
    expect(initials('Ferretería Don José')).toBe('FD');
    expect(initials('lucía')).toBe('L');
    expect(initials('5492994000000')).toBe('54');
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});

describe('listTime', () => {
  const now = new Date(2026, 9, 20, 15, 0);
  it('hoy hora, ayer, o fecha', () => {
    expect(listTime(new Date(2026, 9, 20, 10, 42), now)).toMatch(/10:42/);
    expect(listTime(new Date(2026, 9, 19, 23, 0), now)).toBe('ayer');
    expect(listTime(new Date(2026, 9, 3, 9, 0), now)).toBe('03/10');
    expect(listTime({ _seconds: new Date(2026, 9, 20, 9, 5).getTime() / 1000 }, now)).toMatch(/09:05/);
    expect(listTime(null, now)).toBe('');
  });
});
