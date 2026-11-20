import { formatYear, nearestYear, parseYearInput } from './core.js';

// Consecutive calendar positions put 1 BCE immediately before 1 CE.
const position = year => year < 0 ? year + 1 : year;
const calendarYear = pos => pos <= 0 ? pos - 1 : pos;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const $ = id => document.getElementById(id);

export class Timeline {
  constructor(years, { start, end, singleYear }, onRange, onYear) {
    this.years = years;
    this.singleYear = singleYear;
    this.first = years[0];
    this.last = years.at(-1);
    this.axisStart = position(this.first);
    this.axisEnd = position(this.last);
    $('axis-start').textContent = formatYear(this.first);
    $('axis-end').textContent = formatYear(this.last);
    $('snapshot-ticks').replaceChildren(...years.map(year => {
      const tick = document.createElement('i');
      tick.style.left = this.percent(year);
      return tick;
    }));
    this.setRange(start, end);
    const entry = $('year-entry'), menu = $('year-select');
    const restoreYear = () => {
      entry.setCustomValidity('');
      entry.value = menu.value ? formatYear(Number(menu.value)) : '';
    };
    const commitYear = (reportError) => {
      const year = parseYearInput(entry.value);
      if (this.available.includes(year)) {
        onYear(year);
        restoreYear();
      } else if (reportError) {
        entry.setCustomValidity(year == null ? 'Enter a year such as 117 CE or 42 BCE.'
          : `No snapshot for ${formatYear(year)} in this filter. Choose a year from the menu.`);
        entry.reportValidity();
      } else restoreYear();
    };
    entry.addEventListener('focus', () => entry.select());
    entry.addEventListener('input', () => entry.setCustomValidity(''));
    entry.addEventListener('blur', () => commitYear(false));
    entry.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); commitYear(true); }
      if (event.key === 'Escape') { event.preventDefault(); restoreYear(); }
    });
    menu.addEventListener('change', () => onYear(Number(menu.value)));
    const track = $('timeline-track');
    const handles = [$('from-handle'), $('through-handle'), $('year-slider')];
    for (const input of [$('range-start'), $('range-end')]) {
      input.min = this.first;
      input.max = this.last;
      input.addEventListener('input', () => {
        $('range-start').setCustomValidity('');
        $('range-end').setCustomValidity('');
      });
    }
    $('range-form').addEventListener('submit', event => {
      event.preventDefault();
      const from = $('range-start'), through = $('range-end');
      const a = from.valueAsNumber, b = through.valueAsNumber;
      if (a === 0 || b === 0 || a > b) {
        const invalid = a === 0 ? from : through;
        invalid.setCustomValidity(a === 0 || b === 0 ? 'Use −1 for 1 BCE or 1 for 1 CE.' : 'Through must be on or after From.');
        invalid.reportValidity();
        return;
      }
      onRange(a, b);
    });
    $('full-range').addEventListener('click', () => onRange(this.first, this.last));

    const valueAt = clientX => {
      const rect = track.getBoundingClientRect();
      const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
      return calendarYear(Math.round(this.axisStart + fraction * (this.axisEnd - this.axisStart)));
    };
    let dragging, scrubTimer;
    const move = event => {
      if (!dragging || dragging.pointer !== event.pointerId) return;
      const value = valueAt(event.clientX + dragging.offset);
      if (dragging.handle === handles[0]) this.paintRange(Math.min(value, this.end), this.end);
      else if (dragging.handle === handles[1]) this.paintRange(this.start, Math.max(value, this.start));
      else if (this.available.length) {
        const next = nearestYear(this.available, value);
        if (dragging.year === next) return;
        dragging.year = next;
        this.place('year-slider', next, this.available[0], this.available.at(-1));
        clearTimeout(scrubTimer);
        scrubTimer = setTimeout(() => onYear(next), 120);
      }
    };
    track.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      const handle = handles.includes(event.target) ? event.target : handles[2];
      if (handle.disabled) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      track.setPointerCapture(event.pointerId);
      const rect = handle.getBoundingClientRect();
      const anchor = handle === handles[0] ? rect.right : handle === handles[1] ? rect.left : (rect.left + rect.right) / 2;
      dragging = { handle, pointer: event.pointerId, offset: event.target === handle ? anchor - event.clientX : 0 };
      if (handle !== handles[2]) this.paintRange(this.start, this.end);
      if (handle === handles[2] && event.target !== handle) move(event);
    });
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', event => {
      if (!dragging || dragging.pointer !== event.pointerId) return;
      const { handle, year } = dragging;
      dragging = null;
      clearTimeout(scrubTimer);
      if (handle !== handles[2]) onRange($('range-start').valueAsNumber, $('range-end').valueAsNumber);
      else if (year != null) onYear(year);
    });
    track.addEventListener('lostpointercapture', () => {
      clearTimeout(scrubTimer);
      if (dragging) {
        this.paintRange(this.start, this.end);
        if (this.available.length) this.renderYear(Number($('year-select').value));
      }
      dragging = null;
    });
    for (const handle of handles) handle.addEventListener('keydown', event => {
      const steps = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
      if (!(event.key in steps) && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const advance = (value, min, max) => event.key === 'Home' ? min : event.key === 'End' ? max : clamp(value + steps[event.key], min, max);
      if (handle === handles[2]) {
        const index = this.available.indexOf(Number(handle.getAttribute('aria-valuenow')));
        onYear(this.available[advance(index, 0, this.available.length - 1)]);
      } else if (handle === handles[0]) {
        onRange(calendarYear(advance(position(this.start), position(this.first), position(this.end))), this.end);
      } else {
        onRange(this.start, calendarYear(advance(position(this.end), position(this.start), position(this.last))));
      }
    });
  }
  setRange(start, end) {
    this.start = start;
    this.end = end;
    this.rangeYears = this.years.filter(y => y >= start && y <= end);
  }
  get available() {
    return this.singleYear ? this.years : this.rangeYears;
  }
  coverage(year) {
    const start = this.singleYear ? year : this.start;
    const end = this.singleYear ? year : this.end;
    const label = start === end ? formatYear(start) : `${formatYear(start)} – ${formatYear(end)}`;
    const count = this.singleYear ? 1 : this.rangeYears.length;
    return { start, end, label, countLabel: `${count} snapshot${count === 1 ? '' : 's'}` };
  }
  percent(year) {
    return (position(year) - this.axisStart) * 100 / (this.axisEnd - this.axisStart || 1) + '%';
  }
  place(id, year, min, max) {
    const handle = $(id);
    handle.style.left = this.percent(year);
    if (id === 'year-slider') {
      $('year-picker').style.setProperty('--playhead', handle.style.left);
      $('year-entry').value = formatYear(year);
    }
    handle.setAttribute('aria-valuenow', year);
    handle.setAttribute('aria-valuemin', min);
    handle.setAttribute('aria-valuemax', max);
    handle.setAttribute('aria-valuetext', formatYear(year));
    handle.title = `${handle.getAttribute('aria-label')} · ${formatYear(year)}`;
    handle.disabled = false;
  }
  paintRange(start, end) {
    const coverage = $('timeline-coverage');
    if (this.singleYear || (start === end && this.years.includes(start))) coverage.textContent = '';
    else coverage.textContent = start === end ? formatYear(start) : `From ${formatYear(start)} through ${formatYear(end)}`;
    $('range-start').value = start;
    $('range-end').value = end;
    $('range-start').setCustomValidity('');
    $('range-end').setCustomValidity('');
    this.place('from-handle', start, this.first, end);
    this.place('through-handle', end, start, this.last);
    $('range-band').style.left = this.percent(start);
    $('range-band').style.right = `calc(100% - ${this.percent(end)})`;
  }
  renderRange(onExtend) {
    $('time-coverage').querySelector(`input[value="${this.singleYear ? 'year' : 'range'}"]`).checked = true;
    for (const id of ['range-form', 'from-handle', 'through-handle', 'range-band']) $(id).hidden = this.singleYear;
    this.paintRange(this.start, this.end);
    if (!this.singleYear) {
      $('range-summary').textContent = `Search and download · ${this.coverage().countLabel}`;
    }
    $('full-range').hidden = this.singleYear || (this.start === this.first && this.end === this.last);
    $('year-select').replaceChildren(...this.available.map(y => new Option(formatYear(y), y)));
    $('nearby-years').replaceChildren();
    if (!this.available.length) {
      $('year-select').add(new Option('No snapshots', ''));
      const neighbors = [this.years.filter(y => y < this.start).at(-1), this.years.find(y => y > this.end)];
      for (const y of neighbors.filter(Number.isFinite)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `Include ${formatYear(y)}`;
        button.addEventListener('click', () => onExtend(y));
        $('nearby-years').append(button);
      }
    }
  }
  renderYear(year) {
    const available = this.available;
    $('year-select').value = year ?? '';
    $('year-select').disabled = !available.length;
    $('year-entry').disabled = !available.length;
    $('year-entry').setCustomValidity('');
    if (year == null) {
      $('year-entry').value = '';
      $('year-picker').style.removeProperty('--playhead');
    }
    if (this.singleYear) $('range-summary').textContent = `Search and download · ${formatYear(year)}`;
    $('year-slider').hidden = year == null;
    if (year != null) this.place('year-slider', year, available[0], available.at(-1));
    $('previous').disabled = !available.length || year === available[0];
    $('next').disabled = !available.length || year === available.at(-1);
    $('play').disabled = available.length < 2;
  }
}
