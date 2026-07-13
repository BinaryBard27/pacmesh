class Maze {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.grid = this._generate(rows, cols);
    this.pellets = [];
    this.powerPellets = [];
    this._placePellets();
  }

  _generate(rows, cols) {
    const grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => 1)
    );

    const cellRows = Math.floor((rows - 1) / 2);
    const cellCols = Math.floor((cols - 1) / 2);

    const visited = Array.from({ length: cellRows }, () =>
      Array.from({ length: cellCols }, () => false)
    );

    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    const shuffle = (a) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const carve = (r, c) => {
      visited[r][c] = true;
      const gr = r * 2 + 1;
      const gc = c * 2 + 1;
      grid[gr][gc] = 0;

      const shuffled = shuffle([...dirs]);
      for (const [dr, dc] of shuffled) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= cellRows || nc < 0 || nc >= cellCols) continue;
        if (visited[nr][nc]) continue;
        grid[gr + dr][gc + dc] = 0;
        carve(nr, nc);
      }
    };

    carve(0, 0);

    grid[rows - 2][1] = 0;
    grid[1][cols - 2] = 0;

    for (let r = 2; r < rows; r += 2) {
      for (let c = 2; c < cols; c += 2) {
        if (Math.random() < 0.2) {
          grid[r - 1][c] = 0;
        }
        if (Math.random() < 0.2) {
          grid[r][c - 1] = 0;
        }
      }
    }

    for (let r = 0; r < rows; r++) {
      grid[r][0] = 1;
      grid[r][cols - 1] = 1;
    }
    for (let c = 0; c < cols; c++) {
      grid[0][c] = 1;
      grid[rows - 1][c] = 1;
    }

    return grid;
  }

  _placePellets() {
    this.pellets = [];
    this.powerPellets = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === 0) {
          this.pellets.push({ r, c });
        }
      }
    }

    const powerPositions = [
      { r: 1, c: 1 },
      { r: 1, c: this.cols - 2 },
      { r: this.rows - 2, c: 1 },
      { r: this.rows - 2, c: this.cols - 2 },
    ];

    for (const pp of powerPositions) {
      if (this.grid[pp.r] && this.grid[pp.r][pp.c] === 0) {
        this.powerPellets.push({ r: pp.r, c: pp.c });
        const idx = this.pellets.findIndex((p) => p.r === pp.r && p.c === pp.c);
        if (idx !== -1) this.pellets.splice(idx, 1);
      }
    }
  }

  isWall(r, c) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return true;
    return this.grid[r][c] === 1;
  }

  getSpawnPoints() {
    const centerR = Math.floor(this.rows / 2);
    const centerC = Math.floor(this.cols / 2);
    const spawns = [];

    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = centerR + dr;
        const c = centerC + dc;
        if (r > 0 && r < this.rows - 1 && c > 0 && c < this.cols - 1 && this.grid[r][c] === 0) {
          spawns.push({ r, c });
        }
      }
    }

    const shuffled = spawns.sort(() => Math.random() - 0.5);
    return {
      pacmen: shuffled.slice(0, 2),
      ghosts: shuffled.slice(2, 4),
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Maze };
}
