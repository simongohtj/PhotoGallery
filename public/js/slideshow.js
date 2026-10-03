/**
 * Photo Gallery - Slideshow Controller
 * Features:
 * - Ken Burns gentle pan & zoom effect with alternating cinematic angles
 * - Seamless crossfading using dual buffer layers
 * - Pause / Resume on photo click with visual badge
 * - Discreet navigation controls with idle auto-hide
 * - Stylized overlay calculating wedding anniversary & daughter's age
 */

(function () {
  'use strict';

  // State
  // State
  let config = {
    milestones: [],
    slideDuration: 6,
    kenBurnsEffect: true,
    musicUrl: '',
    musicVolume: 0.7,
    musicEnabled: false
  };

  let photos = [];
  let currentIndex = 0;
  let isPaused = false;
  let slideTimer = null;
  let progressInterval = null;
  let slideStartTime = 0;
  let elapsedBeforePause = 0;
  let currentLayer = 'A'; // 'A' or 'B'
  let idleTimeout = null;
  let activeMilestoneOffset = 0;
  let hasUserInteracted = false;

  // DOM Elements
  const viewport = document.getElementById('viewport');
  const slideA = document.getElementById('slideA');
  const slideB = document.getElementById('slideB');
  const imgA = document.getElementById('imgA');
  const imgB = document.getElementById('imgB');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const pauseWatermark = document.getElementById('pauseWatermark');
  const pauseBadge = document.getElementById('pauseBadge');
  const pauseText = document.getElementById('pauseText');
  const progressBar = document.getElementById('progressBar');
  const overlayContainer = document.getElementById('overlayContainer');
  const milestonesCard = document.getElementById('milestonesCard');
  const emptyState = document.getElementById('emptyState');
  const locationOverlay = document.getElementById('locationOverlay');
  const locationCountry = document.getElementById('locationCountry');
  const globeViewport = document.getElementById('globeViewport');
  const bgMusic = document.getElementById('bgMusic');
  const musicBtn = document.getElementById('musicBtn');
  const musicIcon = document.getElementById('musicIcon');

  // Mini-Globe Engine State (D3.js)
  let globeSvg = null;
  let globeProjection = null;
  let globePath = null;
  let globeLandPaths = null;
  let globePin = null;
  let globeReady = false;
  let countryCenters = {};

  // Ken Burns Animation variations
  const kbAnimations = [
    'kb-zoom-in',
    'kb-zoom-out',
    'kb-pan-right',
    'kb-pan-left',
    'kb-zoom-pan-up',
    'kb-zoom-pan-down'
  ];
  let lastAnimIndex = -1;

  function getRandomAnimation() {
    let nextIdx;
    do {
      nextIdx = Math.floor(Math.random() * kbAnimations.length);
    } while (nextIdx === lastAnimIndex && kbAnimations.length > 1);
    lastAnimIndex = nextIdx;
    return kbAnimations[nextIdx];
  }

  // Number ordinal helper (1st, 2nd, 3rd, 4th, etc.)
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

  // Format Milestone (Countdown, Anniversary, or Age)
  function formatMilestone(m) {
    if (!m || !m.date) return null;
    const emoji = m.emoji || '🎉';
    const title = m.title || 'Milestone';
    const targetDate = parseLocalDate(m.date);
    if (!targetDate) return null;

    const nowDate = getTodayLocalDate();
    const type = (m.type === 'elapsed') ? 'age' : (m.type || 'anniversary');
    let text = '';

    if (type === 'countdown') {
      if (targetDate < nowDate) {
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

    return { emoji, title, text };
  }

  // Update Stylized Overlay
  function updateOverlay() {
    if (!milestonesCard || !overlayContainer) return;

    const milestones = Array.isArray(config.milestones)
      ? config.milestones.filter(m => m && m.enabled !== false)
      : [];

    if (milestones.length === 0) {
      overlayContainer.style.display = 'none';
      return;
    }

    overlayContainer.style.display = 'block';

    // Show up to 2 milestones at a time, cycling with activeMilestoneOffset
    const maxVisible = 2;
    let visibleMilestones = [];
    if (milestones.length <= maxVisible) {
      visibleMilestones = milestones;
    } else {
      for (let i = 0; i < maxVisible; i++) {
        const idx = (activeMilestoneOffset + i) % milestones.length;
        visibleMilestones.push(milestones[idx]);
      }
    }

    milestonesCard.innerHTML = '';
    visibleMilestones.forEach(m => {
      const formatted = formatMilestone(m);
      if (!formatted) return;

      const item = document.createElement('div');
      item.className = 'overlay-item';
      item.innerHTML = `
        <div class="overlay-icon">${formatted.emoji}</div>
        <div class="overlay-text">
          <span class="overlay-label">${formatted.title}</span>
          <span class="overlay-title">${formatted.text}</span>
        </div>
      `;
      milestonesCard.appendChild(item);
    });
  }

  // ---------------- Background Music Controller ---------------- //

  function initAudio() {
    if (!bgMusic || !musicBtn) return;

    if (!config.musicUrl || !config.musicUrl.trim()) {
      musicBtn.style.display = 'none';
      bgMusic.pause();
      bgMusic.src = '';
      return;
    }

    musicBtn.style.display = 'flex';
    bgMusic.src = config.musicUrl;
    bgMusic.volume = typeof config.musicVolume === 'number' ? config.musicVolume : 0.7;

    updateMusicUI(!bgMusic.paused);
  }

  function updateMusicUI(isPlaying) {
    if (!musicIcon || !musicBtn) return;
    if (isPlaying) {
      musicIcon.textContent = '🔊';
      musicBtn.title = 'Mute Background Music';
      musicBtn.setAttribute('aria-label', 'Mute Background Music');
      musicBtn.style.opacity = '0.9';
    } else {
      musicIcon.textContent = '🔇';
      musicBtn.title = 'Play Background Music';
      musicBtn.setAttribute('aria-label', 'Play Background Music');
      musicBtn.style.opacity = '0.4';
    }
  }

  function toggleMusic() {
    if (!bgMusic || !bgMusic.src) return;
    if (bgMusic.paused) {
      bgMusic.play().then(() => {
        updateMusicUI(true);
      }).catch(err => {
        console.warn('Playback error:', err);
      });
    } else {
      bgMusic.pause();
      updateMusicUI(false);
    }
  }

  function tryAutoPlayOnInteraction() {
    if (hasUserInteracted) return;
    hasUserInteracted = true;
    if (config.musicEnabled && config.musicUrl && bgMusic && bgMusic.paused) {
      bgMusic.play().then(() => {
        updateMusicUI(true);
      }).catch(err => {
        console.log('Autoplay prevented on interaction:', err);
        updateMusicUI(false);
      });
    }
  }

  // ---------------- Mini-Globe Engine (D3.js) ---------------- //

  async function initGlobe() {
    if (typeof d3 === 'undefined' || typeof topojson === 'undefined' || !globeViewport) {
      return;
    }

    try {
      const [worldRes, centersRes] = await Promise.all([
        fetch('/js/world-110m.json'),
        fetch('/js/country-centers.json')
      ]);

      if (!worldRes.ok) return;
      const worldData = await worldRes.json();
      if (centersRes.ok) {
        countryCenters = await centersRes.json();
      }

      const size = 56;
      const radius = 26;

      globeProjection = d3.geoOrthographic()
        .scale(radius)
        .translate([size / 2, size / 2])
        .clipAngle(90)
        .rotate([0, 0]);

      globePath = d3.geoPath().projection(globeProjection);

      globeSvg = d3.select(globeViewport)
        .append('svg')
        .attr('viewBox', `0 0 ${size} ${size}`)
        .attr('width', size)
        .attr('height', size);

      // Globe background sphere (ocean)
      globeSvg.append('path')
        .datum({ type: 'Sphere' })
        .attr('class', 'globe-sphere')
        .attr('d', globePath);

      // Graticule grid
      const graticule = d3.geoGraticule10();
      globeSvg.append('path')
        .datum(graticule)
        .attr('class', 'globe-graticule')
        .attr('d', globePath);

      // Land & countries
      const countries = topojson.feature(worldData, worldData.objects.countries).features;
      globeLandPaths = globeSvg.append('g')
        .selectAll('path')
        .data(countries)
        .enter()
        .append('path')
        .attr('class', 'globe-land')
        .attr('d', globePath);

      // Coordinate Pin
      globePin = globeSvg.append('circle')
        .attr('class', 'globe-pin')
        .attr('r', 3)
        .style('display', 'none');

      globeReady = true;
    } catch (err) {
      console.warn('Mini-globe initialization failed:', err);
    }
  }

  function updateLocation(photo) {
    if (!photo || !photo.country) {
      if (locationOverlay) {
        locationOverlay.classList.add('is-hidden');
        setTimeout(() => {
          if (!photos[currentIndex] || !photos[currentIndex].country) {
            locationOverlay.style.display = 'none';
          }
        }, 600);
      }
      return;
    }

    if (locationCountry) {
      locationCountry.textContent = photo.country;
    }
    if (locationOverlay) {
      locationOverlay.style.display = 'block';
      void locationOverlay.offsetWidth;
      locationOverlay.classList.remove('is-hidden');
    }

    if (!globeReady || !globeSvg || !globeProjection) return;

    // Resolve coordinates
    let targetLng = typeof photo.longitude === 'number' ? photo.longitude : null;
    let targetLat = typeof photo.latitude === 'number' ? photo.latitude : null;

    const cName = photo.country.toLowerCase().trim();
    let countryId = photo.countryCode || '';

    if (targetLng === null || targetLat === null) {
      if (countryCenters[cName]) {
        targetLng = countryCenters[cName].lng;
        targetLat = countryCenters[cName].lat;
        if (!countryId) countryId = countryCenters[cName].id;
      } else {
        // Fallback search
        for (const [key, val] of Object.entries(countryCenters)) {
          if (key.includes(cName) || cName.includes(key)) {
            targetLng = val.lng;
            targetLat = val.lat;
            if (!countryId) countryId = val.id;
            break;
          }
        }
      }
    }

    if (targetLng === null || targetLat === null) {
      targetLng = 0;
      targetLat = 0;
    }

    const targetRotation = [-targetLng, -targetLat];

    // Smooth rotation with D3
    const currentRot = globeProjection.rotate();
    const interpolate = d3.interpolate(currentRot, targetRotation);

    globeSvg.transition()
      .duration(1200)
      .ease(d3.easeCubicOut)
      .tween('rotate', () => {
        return (t) => {
          globeProjection.rotate(interpolate(t));
          globeSvg.selectAll('.globe-sphere, .globe-graticule').attr('d', globePath);
          globeLandPaths.attr('d', globePath);

          // Highlight matching country
          globeLandPaths.classed('globe-country-highlight', d => {
            const nameMatch = d.properties && d.properties.name && (
              d.properties.name.toLowerCase() === cName ||
              cName.includes(d.properties.name.toLowerCase()) ||
              d.properties.name.toLowerCase().includes(cName)
            );
            const codeMatch = countryId && (d.id === countryId || String(Number(d.id)) === String(Number(countryId)));
            return Boolean(nameMatch || codeMatch);
          });

          // Pin coordinate
          if (typeof photo.longitude === 'number' && typeof photo.latitude === 'number') {
            const center = globeProjection.invert([28, 28]);
            const dist = d3.geoDistance([photo.longitude, photo.latitude], center);
            if (dist < Math.PI / 2) {
              const p = globeProjection([photo.longitude, photo.latitude]);
              globePin.style('display', 'block')
                .attr('cx', p[0])
                .attr('cy', p[1]);
            } else {
              globePin.style('display', 'none');
            }
          } else {
            globePin.style('display', 'none');
          }
        };
      });
  }

  // Apply photo to target layer with Ken Burns animation
  function applyPhotoToLayer(layerEl, imgEl, photo) {
    // Reset animation classes
    kbAnimations.forEach(cls => imgEl.classList.remove(cls));

    const slideDuration = (config.slideDuration || 6);
    // Animation slightly longer than slide duration for seamless continuity
    imgEl.style.setProperty('--anim-duration', `${slideDuration + 2}s`);

    // Focal point alignment (default: center 50% 50%)
    const fx = (photo.focalPoint && typeof photo.focalPoint.x === 'number') ? photo.focalPoint.x : 50;
    const fy = (photo.focalPoint && typeof photo.focalPoint.y === 'number') ? photo.focalPoint.y : 50;

    imgEl.style.objectPosition = `${fx}% ${fy}%`;
    imgEl.style.transformOrigin = `${fx}% ${fy}%`;

    imgEl.src = `/uploads/${photo.filename}`;

    if (config.kenBurnsEffect !== false) {
      const anim = getRandomAnimation();
      // Force reflow so animation restarts smoothly
      void imgEl.offsetWidth;
      imgEl.classList.add(anim);
    }
  }

  // Show photo by index
  function showPhoto(index) {
    if (photos.length === 0) {
      emptyState.style.display = 'flex';
      if (locationOverlay) locationOverlay.style.display = 'none';
      return;
    }
    emptyState.style.display = 'none';

    currentIndex = (index + photos.length) % photos.length;
    const photo = photos[currentIndex];

    const targetLayer = currentLayer === 'A' ? slideB : slideA;
    const targetImg = currentLayer === 'A' ? imgB : imgA;
    const currentLayerEl = currentLayer === 'A' ? slideA : slideB;

    applyPhotoToLayer(targetLayer, targetImg, photo);

    // Update location mini-globe
    updateLocation(photo);

    // Rotate milestones if more than 2
    const enabledMilestones = Array.isArray(config.milestones) ? config.milestones.filter(m => m && m.enabled !== false) : [];
    if (enabledMilestones.length > 2) {
      activeMilestoneOffset = (activeMilestoneOffset + 1) % enabledMilestones.length;
    }
    updateOverlay();

    // Crossfade: activate target, deactivate current
    targetLayer.classList.add('active');
    currentLayerEl.classList.remove('active');

    // Flip layer
    currentLayer = currentLayer === 'A' ? 'B' : 'A';

    // Reset progress and schedule next photo
    resetSlideTimer();

    // Preload next photo in background
    if (photos.length > 1) {
      const nextIdx = (currentIndex + 1) % photos.length;
      const preloadImg = new Image();
      preloadImg.src = `/uploads/${photos[nextIdx].filename}`;
    }
  }

  function nextPhoto() {
    showPhoto(currentIndex + 1);
  }

  function prevPhoto() {
    showPhoto(currentIndex - 1);
  }

  // Progress Bar and Slide Timing
  function resetSlideTimer() {
    clearTimeout(slideTimer);
    clearInterval(progressInterval);
    elapsedBeforePause = 0;
    slideStartTime = Date.now();
    progressBar.style.width = '0%';

    if (!isPaused && photos.length > 1) {
      startSlideTimer();
    }
  }

  function startSlideTimer() {
    const totalDuration = (config.slideDuration || 6) * 1000;
    const remainingTime = Math.max(200, totalDuration - elapsedBeforePause);
    slideStartTime = Date.now() - elapsedBeforePause;

    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      if (isPaused) return;
      const elapsed = Date.now() - slideStartTime;
      const percent = Math.min(100, (elapsed / totalDuration) * 100);
      progressBar.style.width = `${percent}%`;
    }, 50);

    clearTimeout(slideTimer);
    slideTimer = setTimeout(() => {
      nextPhoto();
    }, remainingTime);
  }

  // Pause / Resume Toggle
  function togglePause() {
    isPaused = !isPaused;

    if (isPaused) {
      viewport.classList.add('is-paused');
      clearTimeout(slideTimer);
      clearInterval(progressInterval);
      elapsedBeforePause = Date.now() - slideStartTime;

      if (pauseWatermark) pauseWatermark.classList.add('visible');
      pauseText.textContent = 'Paused';
      pauseBadge.classList.add('visible');
    } else {
      viewport.classList.remove('is-paused');
      if (pauseWatermark) pauseWatermark.classList.remove('visible');
      pauseText.textContent = 'Playing';
      pauseBadge.classList.add('visible');

      setTimeout(() => {
        if (!isPaused) {
          pauseBadge.classList.remove('visible');
        }
      }, 900);

      startSlideTimer();
    }
  }

  // Discreet Auto-Hide Controls on Inactivity
  function resetIdleTimer() {
    document.body.classList.remove('hide-controls');
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      if (!isPaused) {
        document.body.classList.add('hide-controls');
      }
    }, 3200);
  }

  // Fullscreen Handler
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  // Initialize Event Listeners
  function initEvents() {
    // Clicking anywhere on the photo/viewport toggles pause
    viewport.addEventListener('click', (e) => {
      // Don't toggle if clicking on interactive buttons or overlay links
      if (e.target.closest('.nav-btn, .top-bar, a, button, input')) {
        return;
      }
      togglePause();
    });

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      prevPhoto();
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      nextPhoto();
    });

    fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreen();
    });

    if (musicBtn) {
      musicBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hasUserInteracted = true;
        toggleMusic();
      });
    }

    // Auto-unlock background music on first user tap or click
    window.addEventListener('click', tryAutoPlayOnInteraction, { once: true });
    window.addEventListener('touchstart', tryAutoPlayOnInteraction, { once: true, passive: true });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        nextPhoto();
      } else if (e.key === 'ArrowLeft') {
        prevPhoto();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        hasUserInteracted = true;
        toggleMusic();
      }
    });

    // Mouse movement reveals controls
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer, { passive: true });

    // Dynamic visual viewport height for iOS Safari & mobile screens
    function updateViewportHeight() {
      const vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
    }
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportHeight);
    }
    updateViewportHeight();

    // Update overlay dates periodically (every minute)
    setInterval(updateOverlay, 60000);
  }

  // Fetch data & boot
  async function loadData() {
    try {
      const [configRes, photosRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/photos'),
        initGlobe()
      ]);

      if (configRes.ok) {
        config = await configRes.json();
      }

      if (photosRes.ok) {
        photos = await photosRes.json();
      }

      initAudio();
      updateOverlay();

      if (photos.length > 0) {
        const randomIndex = Math.floor(Math.random() * photos.length);
        showPhoto(randomIndex);
      } else {
        emptyState.style.display = 'flex';
      }

      resetIdleTimer();
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  // Launch
  initEvents();
  loadData();
})();
