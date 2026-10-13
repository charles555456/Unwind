/*
 * Unwind fx — thinking orbs and a monochrome border beam from Libraries.dev
 * (MIT, Jakub Antalik), mounted onto plain HTML.
 *
 * Markup opts in; nothing else on the page needs React:
 *   <span class="fx-orb" data-orb="searching"></span>       a 20px orb
 *   <span class="fx-orb" data-orb="breathing" data-orb-size="64"></span>
 *   <div class="fx-host" data-fx-beam="line|sm|md"></div>   a beam on this box
 * (Not data-beam: the beam component uses that name on its own layers.)
 * Elements added later are picked up, and removed ones are cleaned up.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThinkingOrb } from 'thinking-orbs';
import { BorderBeam } from 'border-beam';

const h = React.createElement;
const roots = new Map();
const isDark = () => document.documentElement.classList.contains('dark');

// Spots the site renders without the opt-in attributes
const RULES = [
  { sel: '#reviewList > .review-card:first-child', beam: 'line', strength: '0.75', duration: '4.2' }
];

function mountOrb(el) {
  if (roots.has(el)) return;
  const size = el.dataset.orbSize === '64' ? 64 : 20;
  const root = createRoot(el);
  roots.set(el, root);
  root.render(h(ThinkingOrb, { state: el.dataset.orb || 'breathing', size, theme: 'auto', 'aria-hidden': true }));
}

function mountBeam(host) {
  if (host.querySelector(':scope > .fx-beam')) return;
  const overlay = document.createElement('span');
  overlay.className = 'fx-beam';
  overlay.setAttribute('aria-hidden', 'true');
  host.appendChild(overlay);
  const radius = parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0;
  const root = createRoot(overlay);
  roots.set(overlay, root);
  root.render(h(BorderBeam, {
    size: ['sm', 'md', 'line', 'pulse-inner', 'pulse-outside'].includes(host.dataset.fxBeam) ? host.dataset.fxBeam : 'md',
    colorVariant: 'mono',
    staticColors: true,
    theme: isDark() ? 'dark' : 'light',
    strength: Number(host.dataset.fxBeamStrength || 0.8),
    duration: host.dataset.fxBeamDuration ? Number(host.dataset.fxBeamDuration) : undefined,
    borderRadius: radius,
    style: { position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }
  }, h('div', { style: { width: '100%', height: '100%', borderRadius: radius } })));
}

function scan(root) {
  if (!root || root.nodeType !== 1) return;
  RULES.forEach(r => {
    const el = root.matches && root.matches(r.sel) ? root : root.querySelector(r.sel);
    if (el && !el.dataset.fxBeam) {
      el.classList.add('fx-host');
      el.dataset.fxBeam = r.beam;
      if (r.strength) el.dataset.fxBeamStrength = r.strength;
      if (r.duration) el.dataset.fxBeamDuration = r.duration;
    }
  });
  const orbs = root.matches('.fx-orb[data-orb]') ? [root] : [];
  orbs.concat(Array.from(root.querySelectorAll('.fx-orb[data-orb]'))).forEach(mountOrb);
  const hosts = root.matches('[data-fx-beam]') ? [root] : [];
  hosts.concat(Array.from(root.querySelectorAll('[data-fx-beam]'))).forEach(mountBeam);
}

function cleanup() {
  roots.forEach((root, el) => {
    if (!el.isConnected) {
      roots.delete(el);
      // unmount outside the observer callback, React does not like nested renders
      setTimeout(() => root.unmount(), 0);
    }
  });
}

let queued = false;
const pending = new Set();
const mo = new MutationObserver(records => {
  records.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) pending.add(n); }));
  if (queued) return;
  queued = true;
  // a timer, not requestAnimationFrame: frames stop in background tabs
  setTimeout(() => {
    queued = false;
    pending.forEach(n => { if (n.isConnected) scan(n); });
    pending.clear();
    scan(document.getElementById('reviewList') || document.body); // first-card rule after re-renders
    cleanup();
  }, 16);
});

function start() {
  scan(document.body);
  mo.observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
