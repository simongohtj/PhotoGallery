/**
 * Photo Gallery - Admin Controller
 * Handles configuration updates, live previews, photo uploads, deletion, and reordering.
 */

(function () {
  'use strict';

  // Milestones Elements
  const milestonesList = document.getElementById('milestonesList');
  const addMilestoneBtn = document.getElementById('addMilestoneBtn');
  const saveMilestonesBtn = document.getElementById('saveMilestonesBtn');
  const milestonesLivePreview = document.getElementById('milestonesLivePreview');

  // Slideshow & Music Settings
  const slideDurationInput = document.getElementById('slideDuration');
  const slideDurationVal = document.getElementById('slideDurationVal');
  const kenBurnsEffectInput = document.getElementById('kenBurnsEffect');
  const musicEnabledInput = document.getElementById('musicEnabled');
  const musicVolumeInput = document.getElementById('musicVolume');
  const musicVolumeVal = document.getElementById('musicVolumeVal');
  const musicFileInput = document.getElementById('musicFileInput');
  const chooseAudioBtn = document.getElementById('chooseAudioBtn');
  const currentAudioBadge = document.getElementById('currentAudioBadge');
  const audioBadgeName = document.getElementById('audioBadgeName');
  const removeAudioBtn = document.getElementById('removeAudioBtn');
  const musicUrlInput = document.getElementById('musicUrlInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  // Dropzone & Upload Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const uploadStatusText = document.getElementById('uploadStatusText');
  const uploadPercentText = document.getElementById('uploadPercentText');

  // Photo Grid Elements
  const photoCount = document.getElementById('photoCount');
  const photosGrid = document.getElementById('photosGrid');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const batchLocationBtn = document.getElementById('batchLocationBtn');
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
  const deleteSelectedText = document.getElementById('deleteSelectedText');

  // Modal & Toast
  const photoModal = document.getElementById('photoModal');
  const modalPhotoName = document.getElementById('modalPhotoName');
  const focalCanvasWrap = document.getElementById('focalCanvasWrap');
  const modalImage = document.getElementById('modalImage');
  const focalReticle = document.getElementById('focalReticle');
  const phonePreviewImg = document.getElementById('phonePreviewImg');
  const focalCoordsBadge = document.getElementById('focalCoordsBadge');
  const resetFocalBtn = document.getElementById('resetFocalBtn');
  const saveFocalBtn = document.getElementById('saveFocalBtn');
  const modalClose = document.getElementById('modalClose');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  let currentPhotos = [];
  const selectedPhotoIds = new Set();
  let activeEditingPhoto = null;
  let currentFocalX = 50;
  let currentFocalY = 50;
  let currentMilestones = [];

  // ---------------- Date Math Helpers ---------------- //

  function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function getTodayLocalDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function diffPast(now, target) {
    let years = now.getFullYear() - target.getFullYear();
    let months = now.getMonth() - target.getMonth();
    let days = now.getDate() - target.getDate();

    if (days < 0) {
      months--;
      const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      days += prevMonthDays;
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    return { years, months, days };
  }

  function diffFuture(now, target) {
    let years = target.getFullYear() - now.getFullYear();
    let months = target.getMonth() - now.getMonth();
    let days = target.getDate() - now.getDate();

    if (days < 0) {
      months--;
      const prevMonthDays = new Date(target.getFullYear(), target.getMonth(), 0).getDate();
      days += prevMonthDays;
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    return { years, months, days };
  }

  function formatTimeUnits(years, months, days) {
    const parts = [];
    if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    return parts.join(', ');
  }

  function assemblePhrase(prefix, timeText, postfix) {
    const parts = [];
    if (prefix && prefix.trim()) parts.push(prefix.trim());
    if (timeText && timeText.trim()) parts.push(timeText.trim());
    if (postfix && postfix.trim()) parts.push(postfix.trim());
    return parts.join(' ');
  }

  function formatMilestone(m) {
    if (!m || !m.date) return { emoji: m?.emoji || '🎉', title: m?.title || 'Milestone', text: 'Select date...', warning: '' };
    const emoji = m.emoji || '🎉';
    const title = m.title || 'Milestone';
    const targetDate = parseLocalDate(m.date);
    if (!targetDate) return { emoji, title, text: 'Invalid date', warning: 'Invalid date' };

    const nowDate = getTodayLocalDate();
    const type = m.type || 'anniversary';
    let warning = '';
    let text = '';

    if (type === 'countdown') {
      if (targetDate < nowDate) {
        warning = 'Countdown date must be in the future';
        text = assemblePhrase(m.prefix, 'Countdown date has passed', m.postfix);
      } else if (targetDate.getTime() === nowDate.getTime()) {
        text = assemblePhrase(m.prefix, 'today! 🎉', m.postfix);
      } else {
        const { years, months, days } = diffFuture(nowDate, targetDate);
        const timeStr = formatTimeUnits(years, months, days) || 'today! 🎉';
        text = assemblePhrase(m.prefix, timeStr, m.postfix);
      }
    } else if (type === 'anniversary') {
      if (targetDate > nowDate) {
        warning = 'Anniversary date must be in the past';
        text = assemblePhrase(m.prefix, 'Future anniversary date', m.postfix);
      } else {
        const wYear = targetDate.getFullYear();
        const wMonth = targetDate.getMonth();
        const wDay = targetDate.getDate();

        const currentYear = nowDate.getFullYear();
        const currentMonth = nowDate.getMonth();
        const currentDay = nowDate.getDate();

        if (currentMonth === wMonth && currentDay === wDay) {
          const years = currentYear - wYear;
          const note = (m.prefix || m.postfix) ? `${getOrdinal(years)} anniversary today! ❤️` : `Happy ${getOrdinal(years)} Anniversary today! ❤️`;
          text = assemblePhrase(m.prefix, note, m.postfix);
        } else {
          let targetYear = currentYear;
          const hasPassedThisYear = (currentMonth > wMonth) || (currentMonth === wMonth && currentDay > wDay);
          if (hasPassedThisYear) {
            targetYear = currentYear + 1;
          }
          const nextAnniversaryCount = targetYear - wYear;
          const nextAnnivDate = new Date(targetYear, wMonth, wDay);
          const { years, months, days } = diffFuture(nowDate, nextAnnivDate);
          const timeStr = formatTimeUnits(0, months, days) || 'today';
          const defaultPhrase = `${getOrdinal(nextAnniversaryCount)} anniversary in ${timeStr}`;
          text = assemblePhrase(m.prefix, defaultPhrase, m.postfix);
        }
      }
    } else {
      // type === 'age'
      if (targetDate > nowDate) {
        warning = 'Age date must be in the past';
        text = assemblePhrase(m.prefix, 'Future birth date', m.postfix);
      } else if (targetDate.getTime() === nowDate.getTime()) {
        text = assemblePhrase(m.prefix, 'born today! 👶', m.postfix);
      } else {
        const bYear = targetDate.getFullYear();
        const bMonth = targetDate.getMonth();
        const bDay = targetDate.getDate();

        const currentYear = nowDate.getFullYear();
        const currentMonth = nowDate.getMonth();
        const currentDay = nowDate.getDate();

        if (currentMonth === bMonth && currentDay === bDay) {
          const years = currentYear - bYear;
          const note = `turns ${years} year${years !== 1 ? 's' : ''} today! 🎂`;
          text = assemblePhrase(m.prefix, note, m.postfix);
        } else {
          const { years, months, days } = diffPast(nowDate, targetDate);
          const timeStr = formatTimeUnits(years, months, days) || 'today';
          text = assemblePhrase(m.prefix, timeStr, m.postfix);
        }
      }
    }

    return { emoji, title, text, warning };
  }

  function updateMilestonesLivePreview() {
    if (!milestonesLivePreview) return;
    milestonesLivePreview.innerHTML = '';

    const activeList = currentMilestones.filter(m => m.enabled !== false);
    if (activeList.length === 0) {
      milestonesLivePreview.innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.88rem; padding: 12px; text-align: center;">
          No milestones enabled. Add or enable milestones above to preview.
        </div>
      `;
      return;
    }

    activeList.forEach(m => {
      const formatted = formatMilestone(m);
      const line = document.createElement('div');
      line.className = 'preview-line';
      line.innerHTML = `
        <div class="preview-icon">${formatted.emoji}</div>
        <div class="preview-text-group">
          <span class="preview-sub">${formatted.title || 'Milestone'}</span>
          <span class="preview-title">${formatted.text}</span>
        </div>
      `;
      milestonesLivePreview.appendChild(line);
    });
  }

  function renderMilestones() {
    if (!milestonesList) return;
    milestonesList.innerHTML = '';

    if (currentMilestones.length === 0) {
      milestonesList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); background: rgba(0,0,0,0.25); border-radius: var(--radius-sm);">
          No milestones added yet. Click "+ Add Milestone" to track an anniversary, countdown, or age!
        </div>
      `;
      updateMilestonesLivePreview();
      return;
    }

    currentMilestones.forEach((m) => {
      // Migrate old 'elapsed' to 'age'
      if (m.type === 'elapsed') m.type = 'age';
      if (!m.type) m.type = 'anniversary';

      const validation = formatMilestone(m);

      const item = document.createElement('div');
      item.className = `milestone-item ${m.enabled === false ? 'is-disabled' : ''} ${validation.warning ? 'has-warning' : ''}`;
      item.dataset.id = m.id;

      item.innerHTML = `
        <div class="milestone-row-top">
          <input type="text" class="milestone-emoji-input" value="${m.emoji || '🎉'}" title="Emoji" maxlength="4">
          <input type="text" class="form-input milestone-title-input" value="${m.title || ''}" placeholder="Milestone Name (e.g. Wedding, Birthday, Retirement)">
          <input type="date" class="form-input milestone-date-input" value="${m.date || ''}" required>
          <select class="milestone-type-select">
            <option value="countdown" ${m.type === 'countdown' ? 'selected' : ''}>⏳ Countdown (Future Date)</option>
            <option value="anniversary" ${m.type === 'anniversary' ? 'selected' : ''}>💍 Anniversary (Past Date)</option>
            <option value="age" ${m.type === 'age' ? 'selected' : ''}>👶 Age (Past Date)</option>
          </select>
        </div>
        <div class="milestone-row-bottom">
          <input type="text" class="form-input milestone-prefix-input" value="${m.prefix || ''}" placeholder="Optional Prefix (e.g. Together for)">
          <input type="text" class="form-input milestone-postfix-input" value="${m.postfix || ''}" placeholder="Optional Postfix (e.g. and counting)">
          <div class="milestone-actions">
            <label class="toggle-switch" title="Enable or disable this milestone">
              <input type="checkbox" class="milestone-enable-toggle" ${m.enabled !== false ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <button type="button" class="btn-icon-small delete milestone-delete-btn" title="Delete milestone">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
        <div class="milestone-warning ${validation.warning ? 'show' : ''}">${validation.warning ? '⚠️ ' + validation.warning : ''}</div>
      `;

      // Inputs event listeners
      const emojiInput = item.querySelector('.milestone-emoji-input');
      const titleInput = item.querySelector('.milestone-title-input');
      const dateInput = item.querySelector('.milestone-date-input');
      const typeSelect = item.querySelector('.milestone-type-select');
      const prefixInput = item.querySelector('.milestone-prefix-input');
      const postfixInput = item.querySelector('.milestone-postfix-input');
      const enableToggle = item.querySelector('.milestone-enable-toggle');
      const deleteBtn = item.querySelector('.milestone-delete-btn');
      const warningEl = item.querySelector('.milestone-warning');

      const onUpdate = () => {
        m.emoji = emojiInput.value.trim() || '🎉';
        m.title = titleInput.value.trim();
        m.date = dateInput.value;
        m.type = typeSelect.value;
        m.prefix = prefixInput.value;
        m.postfix = postfixInput.value;

        const res = formatMilestone(m);
        if (res.warning) {
          warningEl.textContent = '⚠️ ' + res.warning;
          warningEl.classList.add('show');
          item.classList.add('has-warning');
        } else {
          warningEl.textContent = '';
          warningEl.classList.remove('show');
          item.classList.remove('has-warning');
        }

        updateMilestonesLivePreview();
      };

      ['input', 'change'].forEach(evt => {
        emojiInput.addEventListener(evt, onUpdate);
        titleInput.addEventListener(evt, onUpdate);
        dateInput.addEventListener(evt, onUpdate);
        typeSelect.addEventListener(evt, onUpdate);
        prefixInput.addEventListener(evt, onUpdate);
        postfixInput.addEventListener(evt, onUpdate);
      });

      enableToggle.addEventListener('change', () => {
        m.enabled = enableToggle.checked;
        item.classList.toggle('is-disabled', !m.enabled);
        updateMilestonesLivePreview();
      });

      deleteBtn.addEventListener('click', () => {
        currentMilestones = currentMilestones.filter(x => x.id !== m.id);
        renderMilestones();
      });

      milestonesList.appendChild(item);
    });

    updateMilestonesLivePreview();
  }

  function addMilestone() {
    const newId = 'milestone-' + Date.now();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 30);
    const dateStr = tomorrow.toISOString().split('T')[0];

    currentMilestones.push({
      id: newId,
      title: 'New Milestone',
      date: dateStr,
      emoji: '🎉',
      type: 'countdown',
      prefix: '',
      postfix: '',
      enabled: true
    });
    renderMilestones();
  }

  // Toast Notification
  let toastTimer = null;
  function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // Format File Size
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ---------------- API Actions ---------------- //

  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        currentMilestones = Array.isArray(config.milestones) ? config.milestones.map(m => {
          const type = (m.type === 'elapsed') ? 'age' : (m.type || 'anniversary');
          return {
            ...m,
            type,
            prefix: m.prefix || '',
            postfix: m.postfix || ''
          };
        }) : [];
        renderMilestones();

        slideDurationInput.value = config.slideDuration || 6;
        slideDurationVal.textContent = (config.slideDuration || 6) + 's';
        kenBurnsEffectInput.checked = config.kenBurnsEffect !== false;

        musicEnabledInput.checked = Boolean(config.musicEnabled);
        const vol = Math.round((config.musicVolume ?? 0.7) * 100);
        musicVolumeInput.value = vol;
        musicVolumeVal.textContent = vol + '%';

        musicUrlInput.value = config.musicUrl || '';
        updateAudioBadge(config.musicUrl);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  function updateAudioBadge(url) {
    if (url && url.trim()) {
      currentAudioBadge.style.display = 'inline-flex';
      const name = url.startsWith('/audio/') ? url.replace('/audio/', '') : url;
      audioBadgeName.textContent = name;
    } else {
      currentAudioBadge.style.display = 'none';
      audioBadgeName.textContent = 'No file selected';
    }
  }

  async function saveMilestones() {
    saveMilestonesBtn.disabled = true;
    saveMilestonesBtn.textContent = 'Saving...';

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestones: currentMilestones })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Milestones saved successfully!');
      } else {
        showToast(data.message || 'Error saving milestones', 'error');
      }
    } catch (err) {
      showToast('Network error saving milestones', 'error');
    } finally {
      saveMilestonesBtn.disabled = false;
      saveMilestonesBtn.textContent = 'Save Milestones';
    }
  }

  async function saveSettings() {
    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = 'Saving...';

    const payload = {
      slideDuration: Number(slideDurationInput.value),
      kenBurnsEffect: kenBurnsEffectInput.checked,
      musicEnabled: musicEnabledInput.checked,
      musicVolume: Number(musicVolumeInput.value) / 100,
      musicUrl: musicUrlInput.value.trim()
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Slideshow & Music settings saved!');
      } else {
        showToast(data.message || 'Error saving settings', 'error');
      }
    } catch (err) {
      showToast('Network error saving settings', 'error');
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = 'Save Settings';
    }
  }

  function uploadAudioFile(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('music', file);

    chooseAudioBtn.disabled = true;
    chooseAudioBtn.textContent = 'Uploading...';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/music/upload');

    xhr.onload = () => {
      chooseAudioBtn.disabled = false;
      chooseAudioBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <span>Upload Audio File</span>
      `;
      if (xhr.status >= 200 && xhr.status < 300) {
        const res = JSON.parse(xhr.responseText);
        showToast(res.message || 'Audio uploaded successfully!');
        musicUrlInput.value = res.musicUrl;
        updateAudioBadge(res.musicUrl);
        musicEnabledInput.checked = true;
      } else {
        showToast('Audio upload failed', 'error');
      }
      musicFileInput.value = '';
    };

    xhr.onerror = () => {
      chooseAudioBtn.disabled = false;
      showToast('Network error during audio upload', 'error');
      musicFileInput.value = '';
    };

    xhr.send(formData);
  }

  async function removeAudio() {
    if (!confirm('Remove current background music track?')) return;
    try {
      const res = await fetch('/api/music', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Background music removed');
        musicUrlInput.value = '';
        updateAudioBadge('');
        musicEnabledInput.checked = false;
      } else {
        showToast('Failed to remove audio', 'error');
      }
    } catch (e) {
      showToast('Error removing audio', 'error');
    }
  }

  async function loadPhotos() {
    try {
      const res = await fetch('/api/photos');
      if (res.ok) {
        currentPhotos = await res.json();
        renderPhotos();
      }
    } catch (err) {
      console.error('Failed to load photos:', err);
    }
  }

  let draggedItemIndex = null;

  function updateSelectionUI() {
    const count = selectedPhotoIds.size;
    if (count > 0) {
      if (batchLocationBtn) batchLocationBtn.style.display = 'inline-flex';
      deleteSelectedBtn.style.display = 'inline-flex';
      deleteSelectedText.textContent = `Delete Selected (${count})`;
    } else {
      if (batchLocationBtn) batchLocationBtn.style.display = 'none';
      deleteSelectedBtn.style.display = 'none';
    }

    if (currentPhotos.length > 0 && selectedPhotoIds.size === currentPhotos.length) {
      selectAllBtn.textContent = 'Deselect All';
    } else {
      selectAllBtn.textContent = 'Select All';
    }
  }

  function renderPhotos() {
    photoCount.textContent = `Collection (${currentPhotos.length} photo${currentPhotos.length !== 1 ? 's' : ''}) • Drag to reorder`;
    photosGrid.innerHTML = '';

    if (currentPhotos.length === 0) {
      photosGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">
          <p>No photos uploaded yet. Drop photos above to start your gallery!</p>
        </div>
      `;
      updateSelectionUI();
      return;
    }

    currentPhotos.forEach((photo, idx) => {
      const isSelected = selectedPhotoIds.has(photo.id);
      const card = document.createElement('div');
      card.className = `photo-card ${isSelected ? 'is-selected' : ''}`;
      card.setAttribute('draggable', 'true');
      card.dataset.id = photo.id;
      card.dataset.index = idx;

      const dateStr = photo.uploadedAt ? new Date(photo.uploadedAt).toLocaleDateString() : '';

      card.innerHTML = `
        <label class="photo-select-label" title="Select for deletion">
          <input type="checkbox" class="photo-checkbox" data-id="${photo.id}" ${isSelected ? 'checked' : ''}>
          <span class="custom-check-box"></span>
        </label>
        <div class="photo-drag-badge" title="Drag and drop card to reorder">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="2"></circle>
            <circle cx="15" cy="6" r="2"></circle>
            <circle cx="9" cy="12" r="2"></circle>
            <circle cx="15" cy="12" r="2"></circle>
            <circle cx="9" cy="18" r="2"></circle>
            <circle cx="15" cy="18" r="2"></circle>
          </svg>
          <span>#${idx + 1}</span>
        </div>
        <div class="photo-thumbnail-wrap" title="Click to view and adjust subject focus point">
          <img src="/uploads/${photo.filename}" alt="${photo.originalName || photo.filename}" class="photo-thumbnail" loading="lazy" draggable="false" style="object-position: ${photo.focalPoint ? `${photo.focalPoint.x}% ${photo.focalPoint.y}%` : '50% 50%'};">
        </div>
        <div class="photo-info">
          <span class="photo-name" title="${photo.originalName || photo.filename}">${photo.originalName || photo.filename}</span>
          <div class="photo-meta">
            <span>${formatBytes(photo.size)}</span>
            <span>${dateStr}</span>
          </div>
          <div class="photo-location-row" title="Country where photo was taken">
            <svg class="location-pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <input type="text" class="photo-country-input" value="${photo.country || ''}" placeholder="Add country..." data-id="${photo.id}">
          </div>
          <button type="button" class="photo-focal-badge" title="Click to adjust focal point">
            <span>🎯</span>
            <span class="focal-badge-text">${(photo.focalPoint && (photo.focalPoint.x !== 50 || photo.focalPoint.y !== 50)) ? `${photo.focalPoint.x}%, ${photo.focalPoint.y}%` : 'Focus: Center'}</span>
          </button>
        </div>
        <div class="photo-actions">
          <div class="order-btn-group">
            <button class="btn-icon-small move-up" title="Move earlier in slideshow" ${idx === 0 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button class="btn-icon-small move-down" title="Move later in slideshow" ${idx === currentPhotos.length - 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
          <button class="btn-icon-small delete" title="Delete photo from collection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      // Checkbox listener
      const checkbox = card.querySelector('.photo-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          selectedPhotoIds.add(photo.id);
          card.classList.add('is-selected');
        } else {
          selectedPhotoIds.delete(photo.id);
          card.classList.remove('is-selected');
        }
        updateSelectionUI();
      });

      const selectLabel = card.querySelector('.photo-select-label');
      selectLabel.addEventListener('click', (e) => e.stopPropagation());

      // Drag and Drop Event Listeners
      card.addEventListener('dragstart', (e) => {
        draggedItemIndex = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        setTimeout(() => {
          card.classList.add('is-dragging');
        }, 0);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.querySelectorAll('.photo-card').forEach(c => c.classList.remove('drag-over'));
        draggedItemIndex = null;
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedItemIndex !== null && draggedItemIndex !== idx) {
          card.classList.add('drag-over');
        }
      });

      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove('drag-over');
        }
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over');

        if (draggedItemIndex === null || draggedItemIndex === idx) {
          return;
        }

        const fromIdx = draggedItemIndex;
        const toIdx = idx;
        draggedItemIndex = null;

        await executeReorder(fromIdx, toIdx);
      });

      // Event handlers for this card
      const thumb = card.querySelector('.photo-thumbnail-wrap');
      thumb.addEventListener('click', () => openModal(photo));

      const focalBadge = card.querySelector('.photo-focal-badge');
      if (focalBadge) {
        focalBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          openModal(photo);
        });
      }

      const moveUpBtn = card.querySelector('.move-up');
      if (moveUpBtn && idx > 0) {
        moveUpBtn.addEventListener('click', () => movePhoto(idx, idx - 1));
      }

      const moveDownBtn = card.querySelector('.move-down');
      if (moveDownBtn && idx < currentPhotos.length - 1) {
        moveDownBtn.addEventListener('click', () => movePhoto(idx, idx + 1));
      }

      const deleteBtn = card.querySelector('.delete');
      deleteBtn.addEventListener('click', () => deletePhoto(photo.id, photo.originalName || photo.filename));

      // Country input inline update
      const countryInput = card.querySelector('.photo-country-input');
      if (countryInput) {
        countryInput.addEventListener('click', (e) => e.stopPropagation());
        countryInput.addEventListener('mousedown', (e) => e.stopPropagation());

        const saveCountry = async () => {
          const newCountry = countryInput.value.trim();
          if (newCountry === (photo.country || '')) return;

          try {
            const res = await fetch(`/api/photos/${photo.id}/location`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ country: newCountry })
            });
            const data = await res.json();
            if (data.success && data.photo) {
              photo.country = data.photo.country;
              photo.countryCode = data.photo.countryCode;
              photo.latitude = data.photo.latitude;
              photo.longitude = data.photo.longitude;
              countryInput.value = photo.country || '';
              showToast(photo.country ? `Location set to ${photo.country}` : 'Location cleared');
            } else {
              showToast(data.message || 'Failed to update location', 'error');
            }
          } catch (err) {
            console.error('Error saving country:', err);
            showToast('Error updating location', 'error');
          }
        };

        countryInput.addEventListener('change', saveCountry);
        countryInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            countryInput.blur();
          }
        });
      }

      photosGrid.appendChild(card);
    });

    updateSelectionUI();
  }

  async function executeReorder(fromIdx, toIdx) {
    const moved = currentPhotos.splice(fromIdx, 1)[0];
    currentPhotos.splice(toIdx, 0, moved);
    renderPhotos();

    try {
      const res = await fetch('/api/photos/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: currentPhotos.map(p => p.id) })
      });
      if (res.ok) {
        showToast('Photo order updated');
      } else {
        showToast('Failed to save order', 'error');
      }
    } catch (err) {
      console.error('Failed to save photo order:', err);
      showToast('Error saving photo order', 'error');
    }
  }

  async function movePhoto(fromIdx, toIdx) {
    await executeReorder(fromIdx, toIdx);
  }

  async function deletePhoto(photoId, name) {
    if (!confirm(`Are you sure you want to remove "${name}" from your collection?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Photo removed from collection');
        selectedPhotoIds.delete(photoId);
        currentPhotos = currentPhotos.filter(p => p.id !== photoId);
        renderPhotos();
      } else {
        showToast(data.message || 'Failed to delete photo', 'error');
      }
    } catch (err) {
      showToast('Error deleting photo', 'error');
    }
  }

  // Upload Photos with Progress
  function uploadFiles(files) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i]);
    }

    uploadProgress.style.display = 'block';
    uploadProgressBar.style.width = '0%';
    uploadStatusText.textContent = `Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`;
    uploadPercentText.textContent = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/photos/upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        uploadProgressBar.style.width = percent + '%';
        uploadPercentText.textContent = percent + '%';
      }
    };

    xhr.onload = () => {
      uploadProgress.style.display = 'none';
      if (xhr.status >= 200 && xhr.status < 300) {
        const res = JSON.parse(xhr.responseText);
        showToast(res.message || 'Photos uploaded successfully!');
        loadPhotos();
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          showToast(res.message || 'Upload failed', 'error');
        } catch (e) {
          showToast('Upload failed', 'error');
        }
      }
      fileInput.value = '';
    };

    xhr.onerror = () => {
      uploadProgress.style.display = 'none';
      showToast('Network error during upload', 'error');
      fileInput.value = '';
    };

    xhr.send(formData);
  }

  // Focal Point & Preview Modal
  function updateReticleUI(x, y) {
    currentFocalX = Math.max(0, Math.min(100, Math.round(x * 10) / 10));
    currentFocalY = Math.max(0, Math.min(100, Math.round(y * 10) / 10));

    if (!modalImage || !focalCanvasWrap || !focalReticle) return;

    const imgRect = modalImage.getBoundingClientRect();
    const wrapRect = focalCanvasWrap.getBoundingClientRect();

    if (imgRect.width === 0 || imgRect.height === 0) return;

    const offsetLeft = imgRect.left - wrapRect.left;
    const offsetTop = imgRect.top - wrapRect.top;

    const pixelX = offsetLeft + (currentFocalX / 100) * imgRect.width;
    const pixelY = offsetTop + (currentFocalY / 100) * imgRect.height;

    focalReticle.style.left = `${pixelX}px`;
    focalReticle.style.top = `${pixelY}px`;

    if (phonePreviewImg) {
      phonePreviewImg.style.objectPosition = `${currentFocalX}% ${currentFocalY}%`;
    }

    if (focalCoordsBadge) {
      if (Math.abs(currentFocalX - 50) < 0.5 && Math.abs(currentFocalY - 50) < 0.5) {
        focalCoordsBadge.textContent = 'Focus: Center (50%, 50%)';
      } else {
        focalCoordsBadge.textContent = `Focus: ${currentFocalX}%, ${currentFocalY}%`;
      }
    }
  }

  function openModal(photo) {
    activeEditingPhoto = photo;
    if (modalPhotoName) {
      modalPhotoName.textContent = photo.originalName || photo.filename;
    }
    const src = `/uploads/${photo.filename}`;
    modalImage.src = src;
    if (phonePreviewImg) {
      phonePreviewImg.src = src;
    }

    currentFocalX = (photo.focalPoint && typeof photo.focalPoint.x === 'number') ? photo.focalPoint.x : 50;
    currentFocalY = (photo.focalPoint && typeof photo.focalPoint.y === 'number') ? photo.focalPoint.y : 50;

    photoModal.classList.add('active');

    if (modalImage.complete && modalImage.naturalWidth > 0) {
      requestAnimationFrame(() => updateReticleUI(currentFocalX, currentFocalY));
    } else {
      modalImage.onload = () => {
        requestAnimationFrame(() => updateReticleUI(currentFocalX, currentFocalY));
      };
    }
  }

  function closeModal() {
    photoModal.classList.remove('active');
    activeEditingPhoto = null;
    modalImage.src = '';
    if (phonePreviewImg) phonePreviewImg.src = '';
  }

  // ---------------- Event Listeners ---------------- //

  function initEvents() {
    // Milestones Events
    if (addMilestoneBtn) {
      addMilestoneBtn.addEventListener('click', addMilestone);
    }
    if (saveMilestonesBtn) {
      saveMilestonesBtn.addEventListener('click', saveMilestones);
    }

    // Settings Events
    if (slideDurationInput) {
      slideDurationInput.addEventListener('input', (e) => {
        slideDurationVal.textContent = e.target.value + 's';
      });
    }

    if (musicVolumeInput) {
      musicVolumeInput.addEventListener('input', (e) => {
        musicVolumeVal.textContent = e.target.value + '%';
      });
    }

    if (chooseAudioBtn && musicFileInput) {
      chooseAudioBtn.addEventListener('click', () => musicFileInput.click());
      musicFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          uploadAudioFile(e.target.files[0]);
        }
      });
    }

    if (removeAudioBtn) {
      removeAudioBtn.addEventListener('click', removeAudio);
    }

    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', saveSettings);
    }

    // Dropzone Events
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    ['dragleave', 'dragend'].forEach(type => {
      dropzone.addEventListener(type, () => dropzone.classList.remove('dragover'));
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFiles(e.target.files);
      }
    });

    // Batch Selection Events
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        if (currentPhotos.length === 0) return;
        if (selectedPhotoIds.size === currentPhotos.length) {
          selectedPhotoIds.clear();
        } else {
          currentPhotos.forEach(p => selectedPhotoIds.add(p.id));
        }
        renderPhotos();
      });
    }

    if (batchLocationBtn) {
      batchLocationBtn.addEventListener('click', async () => {
        const count = selectedPhotoIds.size;
        if (count === 0) return;

        const country = prompt(`Enter country for ${count} selected photo${count > 1 ? 's' : ''} (leave blank to clear):`);
        if (country === null) return;

        const trimmedCountry = country.trim();
        try {
          const res = await fetch('/api/photos/batch-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photoIds: Array.from(selectedPhotoIds),
              country: trimmedCountry
            })
          });
          const data = await res.json();
          if (data.success) {
            showToast(data.message || `Updated location for ${count} photos`);
            await loadPhotos();
          } else {
            showToast(data.message || 'Failed to update locations', 'error');
          }
        } catch (err) {
          console.error('Batch location error:', err);
          showToast('Error updating locations', 'error');
        }
      });
    }

    if (deleteSelectedBtn) {
      deleteSelectedBtn.addEventListener('click', async () => {
        const count = selectedPhotoIds.size;
        if (count === 0) return;

        if (!confirm(`Are you sure you want to delete ${count} selected photo${count > 1 ? 's' : ''}?`)) {
          return;
        }

        deleteSelectedBtn.disabled = true;
        deleteSelectedText.textContent = 'Deleting...';

        try {
          const res = await fetch('/api/photos/delete-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds: Array.from(selectedPhotoIds) })
          });
          const data = await res.json();
          if (data.success) {
            showToast(data.message || `Deleted ${count} photos`);
            selectedPhotoIds.clear();
            await loadPhotos();
          } else {
            showToast(data.message || 'Failed to delete photos', 'error');
          }
        } catch (err) {
          console.error('Batch delete error:', err);
          showToast('Error deleting selected photos', 'error');
        } finally {
          deleteSelectedBtn.disabled = false;
          updateSelectionUI();
        }
      });
    }

    // Modal Events
    modalClose.addEventListener('click', closeModal);
    photoModal.addEventListener('click', (e) => {
      if (e.target === photoModal) closeModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && photoModal.classList.contains('active')) {
        closeModal();
      }
    });

    if (focalCanvasWrap) {
      focalCanvasWrap.addEventListener('click', (e) => {
        if (!activeEditingPhoto || !modalImage) return;
        const rect = modalImage.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const pctX = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
        const pctY = Math.max(0, Math.min(100, (clickY / rect.height) * 100));

        updateReticleUI(pctX, pctY);
      });
    }

    if (resetFocalBtn) {
      resetFocalBtn.addEventListener('click', () => {
        updateReticleUI(50, 50);
      });
    }

    if (saveFocalBtn) {
      saveFocalBtn.addEventListener('click', async () => {
        if (!activeEditingPhoto) return;
        saveFocalBtn.disabled = true;
        saveFocalBtn.textContent = 'Saving...';

        const isCenter = (Math.abs(currentFocalX - 50) < 0.5 && Math.abs(currentFocalY - 50) < 0.5);
        const payload = isCenter ? { x: null, y: null } : { x: currentFocalX, y: currentFocalY };

        try {
          const res = await fetch(`/api/photos/${activeEditingPhoto.id}/focal-point`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.success && data.photo) {
            activeEditingPhoto.focalPoint = data.photo.focalPoint;
            showToast(isCenter ? 'Focus reset to Center' : `Focus saved (${currentFocalX}%, ${currentFocalY}%)`);
            renderPhotos();
            closeModal();
          } else {
            showToast(data.message || 'Failed to save focus', 'error');
          }
        } catch (err) {
          console.error('Save focal point error:', err);
          showToast('Error saving focus point', 'error');
        } finally {
          saveFocalBtn.disabled = false;
          saveFocalBtn.textContent = 'Save Focus Point';
        }
      });
    }

    window.addEventListener('resize', () => {
      if (photoModal.classList.contains('active')) {
        updateReticleUI(currentFocalX, currentFocalY);
      }
    });
  }

  // Initial Load
  initEvents();
  loadConfig();
  loadPhotos();
})();
