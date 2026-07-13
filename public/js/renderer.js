class Renderer {
  constructor(canvas, maze) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.maze = maze;
    this.frameCount = 0;
    this._resize();
  }

  _resize() {
    const cs = Math.floor(
      Math.min(
        this.canvas.width / this.maze.cols,
        (this.canvas.height - 20) / this.maze.rows
      )
    );
    this.cellSize = cs;
    this.offsetX = Math.floor(
      (this.canvas.width - cs * this.maze.cols) / 2
    );
    this.offsetY = Math.floor(
      (this.canvas.height - 20 - cs * this.maze.rows) / 2
    ) + 20;
  }

  resize() {
    this._resize();
  }

  clear() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawMaze() {
    const ctx = this.ctx;
    const cs = this.cellSize;
    for (let r = 0; r < this.maze.rows; r++) {
      for (let c = 0; c < this.maze.cols; c++) {
        const x = this.offsetX + c * cs;
        const y = this.offsetY + r * cs;
        if (this.maze.grid[r][c] === 1) {
          ctx.fillStyle = "#2121de";
          ctx.fillRect(x, y, cs, cs);
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cs, cs);
        }
      }
    }
  }

  drawPellets(state) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const pellets = state && state.pellets ? state.pellets : this.maze.pellets;
    const powerPellets = state && state.powerPellets ? state.powerPellets : this.maze.powerPellets;

    ctx.fillStyle = "#ffb8ae";
    for (const p of pellets) {
      const cx = this.offsetX + p.c * cs + cs / 2;
      const cy = this.offsetY + p.r * cs + cs / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of powerPellets) {
      const cx = this.offsetX + p.c * cs + cs / 2;
      const cy = this.offsetY + p.r * cs + cs / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPacman(cx, cy, r, direction) {
    const ctx = this.ctx;
    const mouthAngle = 0.12 + Math.sin(this.frameCount * 0.15) * 0.22;
    let startAngle, endAngle;

    switch (direction) {
      case "right":
        startAngle = mouthAngle;
        endAngle = Math.PI * 2 - mouthAngle;
        break;
      case "left":
        startAngle = Math.PI + mouthAngle;
        endAngle = Math.PI - mouthAngle;
        break;
      case "up":
        startAngle = Math.PI * 1.5 + mouthAngle;
        endAngle = Math.PI * 1.5 - mouthAngle;
        break;
      case "down":
        startAngle = Math.PI * 0.5 + mouthAngle;
        endAngle = Math.PI * 0.5 - mouthAngle;
        break;
      default:
        startAngle = mouthAngle;
        endAngle = Math.PI * 2 - mouthAngle;
    }

    ctx.fillStyle = "#ffff00";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();
  }

  drawGhost(cx, cy, r, color, direction) {
    const ctx = this.ctx;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r * 0.5);
    const segW = (r * 2) / 3;
    for (let i = 2; i >= 0; i--) {
      const x1 = cx + r - i * segW;
      const x2 = cx + r - (i + 1) * segW;
      ctx.quadraticCurveTo((x1 + x2) / 2, cy + r * 0.9, x2, cy + r * 0.5);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.15, r * 0.18, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.35, cy - r * 0.15, r * 0.18, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    const poff = { x: 0, y: 0 };
    if (direction === "right") poff.x = r * 0.08;
    else if (direction === "left") poff.x = -r * 0.08;
    else if (direction === "up") poff.y = -r * 0.08;
    else if (direction === "down") poff.y = r * 0.08;

    ctx.fillStyle = "#0000ff";
    ctx.beginPath();
    ctx.arc(cx - r * 0.35 + poff.x, cy - r * 0.15 + poff.y, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.35 + poff.x, cy - r * 0.15 + poff.y, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  drawEntity(entity, ghostsVulnerable) {
    const cs = this.cellSize;
    const cx = this.offsetX + entity.c * cs + cs / 2;
    const cy = this.offsetY + entity.r * cs + cs / 2;

    if (!entity.alive) return;

    if (entity.role === "pacman") {
      this.drawPacman(cx, cy, cs * 0.35, entity.lastMove || "right");
    } else if (entity.role === "ghost") {
      const color = ghostsVulnerable ? "#2121ff" : (entity.color || "#ff0000");
      this.drawGhost(cx, cy, cs * 0.35, color, entity.lastMove || "left");
    }
  }

  drawHUD(state) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(10, Math.floor(cs * 0.5))}px "Courier New", monospace`;
    ctx.textBaseline = "top";

    const leftX = this.offsetX;
    const rightX = this.offsetX + this.maze.cols * cs;

    ctx.textAlign = "left";
    ctx.fillText("SCORE: " + (state.pacmenScore || 0), leftX, 4);

    ctx.textAlign = "right";
    ctx.fillText("GHOSTS: " + (state.ghostsScore || 0), rightX, 4);
  }

  draw(gameState) {
    this.frameCount++;
    this.clear();
    this.drawHUD(gameState);
    this.drawMaze();
    this.drawPellets(gameState);
    if (gameState && gameState.entities) {
      const v = gameState.ghostsVulnerable || false;
      for (const entity of gameState.entities) {
        this.drawEntity(entity, v);
      }
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Renderer };
}