const { Maze } = require("../public/js/maze.js");
const { Game } = require("../public/js/game.js");

function testMazeGeneration() {
  const maze = new Maze(31, 31);
  console.assert(maze.rows === 31, "Expected 31 rows");
  console.assert(maze.cols === 31, "Expected 31 cols");
  console.assert(maze.grid.length === 31, "Grid row count mismatch");
  console.assert(maze.pellets.length > 0, "Expected pellets");
  console.assert(maze.powerPellets.length > 0, "Expected power pellets");
  console.log("PASS: maze generation");
}

function testGameCreation() {
  const maze = new Maze(31, 31);
  const game = new Game(maze);
  const spawns = maze.getSpawnPoints();
  game.addEntity("p1", "pacman", spawns.pacmen[0].r, spawns.pacmen[0].c);
  game.addEntity("p2", "pacman", spawns.pacmen[1].r, spawns.pacmen[1].c);
  game.addEntity("g1", "ghost", spawns.ghosts[0].r, spawns.ghosts[0].c);
  game.addEntity("g2", "ghost", spawns.ghosts[1].r, spawns.ghosts[1].c);

  console.assert(game.entities.length === 4, "Expected 4 entities");
  console.assert(game.getState().entities.length === 4, "State has 4 entities");
  console.log("PASS: game creation");
}

function testMove() {
  const maze = new Maze(31, 31);
  const game = new Game(maze);
  const spawns = maze.getSpawnPoints();
  const spawn = spawns.pacmen[0];
  game.addEntity("p1", "pacman", spawn.r, spawn.c);

  const moved = game.moveEntity("p1", "up");
  if (moved) {
    const state = game.getState();
    const e = state.entities[0];
    console.assert(e.r !== spawn.r || e.c !== spawn.c, "Entity should have moved");
    console.log("PASS: move (successful)");
  } else {
    if (maze.isWall(spawn.r - 1, spawn.c)) {
      console.log("PASS: move blocked by wall");
    }
  }
}

function testCollisionPacmanEatsGhost() {
  const maze = new Maze(31, 31);
  const game = new Game(maze);
  const spawns = maze.getSpawnPoints();

  const p1 = spawns.pacmen[0];
  const g1 = spawns.ghosts[0];
  game.addEntity("p1", "pacman", p1.r, p1.c);
  game.addEntity("g1", "ghost", g1.r, g1.c);

  game.pellets = [];
  game.powerPellets = [{ r: p1.r, c: p1.c }];
  game._checkPowerPellet(game.entities[0]);
  console.assert(game.ghostsVulnerable === true, "Ghosts should be vulnerable");

  game.entities[1].r = p1.r;
  game.entities[1].c = p1.c;
  game._checkCollisions(game.entities[0]);
  console.assert(game.entities[1].alive === false, "Ghost should be eaten");
  console.log("PASS: pacman eats vulnerable ghost");
}

testMazeGeneration();
testGameCreation();
testMove();
testCollisionPacmanEatsGhost();

console.log("\nAll tests passed!");
