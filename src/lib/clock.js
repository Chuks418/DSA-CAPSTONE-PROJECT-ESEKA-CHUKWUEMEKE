export function createClock(initialTime = new Date()) {
  let currentTime = new Date(initialTime);

  if (Number.isNaN(currentTime.getTime())) {
    throw new TypeError('Invalid initial clock time.');
  }

  return {
    now() {
      return new Date(currentTime);
    },

    set(value) {
      const nextTime = new Date(value);

      if (Number.isNaN(nextTime.getTime())) {
        throw new TypeError('Invalid clock time.');
      }

      currentTime = nextTime;
      return new Date(currentTime);
    },

    advance(milliseconds) {
      if (!Number.isFinite(milliseconds)) {
        throw new TypeError('Milliseconds must be a finite number.');
      }

      currentTime = new Date(currentTime.getTime() + milliseconds);
      return new Date(currentTime);
    },
  };
}