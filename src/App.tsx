import { useState, useCallback } from 'react';

// ===== Types =====
type EdgeType = 'city' | 'road' | 'field';

interface TileData {
  id: string;
  edges: [EdgeType, EdgeType, EdgeType, EdgeType]; // top, right, bottom, left
  hasMonastery: boolean;
  rotation: number;
}

interface PlacedTile {
  tile: TileData;
  x: number;
  y: number;
}

interface Meeple {
  owner: 'player' | 'computer';
  x: number;
  y: number;
  position: string;
}

// ===== Tile Generation =====
const TILE_TEMPLATES: { edges: [EdgeType, EdgeType, EdgeType, EdgeType]; monastery: boolean }[] = [
  { edges: ['city', 'field', 'field', 'field'], monastery: false },
  { edges: ['city', 'city', 'field', 'field'], monastery: false },
  { edges: ['city', 'city', 'city', 'field'], monastery: false },
  { edges: ['city', 'field', 'city', 'field'], monastery: false },
  { edges: ['city', 'city', 'city', 'city'], monastery: false },
  { edges: ['city', 'road', 'city', 'road'], monastery: false },
  { edges: ['city', 'city', 'road', 'road'], monastery: false },
  { edges: ['road', 'field', 'road', 'field'], monastery: false },
  { edges: ['road', 'road', 'field', 'field'], monastery: false },
  { edges: ['road', 'road', 'road', 'field'], monastery: false },
  { edges: ['field', 'field', 'field', 'field'], monastery: true },
  { edges: ['field', 'field', 'field', 'field'], monastery: false },
  { edges: ['city', 'field', 'field', 'field'], monastery: true },
  { edges: ['road', 'field', 'field', 'field'], monastery: true },
  { edges: ['city', 'road', 'field', 'road'], monastery: false },
  { edges: ['road', 'road', 'road', 'road'], monastery: false },
  { edges: ['city', 'city', 'road', 'field'], monastery: false },
  { edges: ['city', 'field', 'road', 'road'], monastery: false },
  { edges: ['road', 'city', 'field', 'city'], monastery: false },
  { edges: ['field', 'road', 'road', 'city'], monastery: false },
  { edges: ['city', 'road', 'road', 'field'], monastery: false },
  { edges: ['field', 'city', 'road', 'city'], monastery: false },
  { edges: ['city', 'city', 'field', 'city'], monastery: false },
  { edges: ['road', 'city', 'road', 'city'], monastery: false },
];

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createDeck(): TileData[] {
  return shuffle(TILE_TEMPLATES.map((t, i) => ({
    id: `t${i}`,
    edges: [...t.edges] as [EdgeType, EdgeType, EdgeType, EdgeType],
    hasMonastery: t.monastery,
    rotation: 0,
  })));
}

function getEdges(tile: TileData): [EdgeType, EdgeType, EdgeType, EdgeType] {
  const e = tile.edges;
  const steps = Math.round(tile.rotation / 90) % 4;
  const arr = [e[0], e[1], e[2], e[3]];
  for (let i = 0; i < steps; i++) {
    const last = arr.pop()!;
    arr.unshift(last);
  }
  return arr as [EdgeType, EdgeType, EdgeType, EdgeType];
}

// ===== Board Logic =====
const BOARD_SIZE = 13;
const CENTER = Math.floor(BOARD_SIZE / 2);

function createBoard(): (PlacedTile | null)[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function getOpposite(idx: number): number {
  return (idx + 2) % 4;
}

function canPlace(board: (PlacedTile | null)[][], tile: TileData, x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return false;
  if (board[y][x] !== null) return false;

  const edges = getEdges(tile);
  const dirs = [
    { dx: 0, dy: -1, myIdx: 0 }, // top
    { dx: 1, dy: 0, myIdx: 1 },  // right
    { dx: 0, dy: 1, myIdx: 2 },  // bottom
    { dx: -1, dy: 0, myIdx: 3 }, // left
  ];

  let hasNeighbor = false;
  for (const d of dirs) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] !== null) {
      hasNeighbor = true;
      const neighborEdges = getEdges(board[ny][nx]!.tile);
      if (edges[d.myIdx] !== neighborEdges[getOpposite(d.myIdx)]) {
        return false;
      }
    }
  }
  return hasNeighbor;
}

function findValidPositions(board: (PlacedTile | null)[][], tile: TileData): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (canPlace(board, tile, x, y)) {
        positions.push({ x, y });
      }
    }
  }
  return positions;
}

function findValidWithRotation(board: (PlacedTile | null)[][], tile: TileData): { x: number; y: number; rotation: number }[] {
  const results: { x: number; y: number; rotation: number }[] = [];
  for (let rot = 0; rot < 360; rot += 90) {
    const rotated = { ...tile, rotation: rot };
    const positions = findValidPositions(board, rotated);
    for (const pos of positions) {
      results.push({ ...pos, rotation: rot });
    }
  }
  return results;
}

// ===== Scoring =====
function countCompletedFeatures(board: (PlacedTile | null)[][]): number {
  const visited = new Set<string>();
  let score = 0;

  // Count completed roads
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const key = `r${x},${y}`;
      const cell = board[y][x];
      if (!cell || visited.has(key)) continue;
      const edges = getEdges(cell.tile);
      const hasRoad = edges.some(e => e === 'road');
      if (!hasRoad) continue;

      // BFS for road
      const tiles: { x: number; y: number }[] = [];
      const queue = [{ x, y }];
      let openEnds = 0;
      const localVisited = new Set<string>();

      while (queue.length > 0) {
        const cur = queue.shift()!;
        const k = `r${cur.x},${cur.y}`;
        if (localVisited.has(k)) continue;
        localVisited.add(k);
        visited.add(k);

        const placed = board[cur.y]?.[cur.x];
        if (!placed) continue;
        tiles.push(cur);
        const ce = getEdges(placed.tile);

        const dirs = [
          { dx: 0, dy: -1, idx: 0 },
          { dx: 1, dy: 0, idx: 1 },
          { dx: 0, dy: 1, idx: 2 },
          { dx: -1, dy: 0, idx: 3 },
        ];

        for (const d of dirs) {
          if (ce[d.idx] === 'road') {
            const nx = cur.x + d.dx;
            const ny = cur.y + d.dy;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE || !board[ny][nx]) {
              openEnds++;
            } else {
              const ne = getEdges(board[ny][nx].tile);
              if (ne[getOpposite(d.idx)] === 'road') {
                if (!localVisited.has(`r${nx},${ny}`)) queue.push({ x: nx, y: ny });
              } else {
                openEnds++;
              }
            }
          }
        }
      }

      if (openEnds === 0 && tiles.length > 0) {
        score += tiles.length;
      }
    }
  }

  // Count completed cities
  visited.clear();
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const key = `c${x},${y}`;
      const cell = board[y][x];
      if (!cell || visited.has(key)) continue;
      const edges = getEdges(cell.tile);
      const hasCity = edges.some(e => e === 'city');
      if (!hasCity) continue;

      const tiles: { x: number; y: number }[] = [];
      const queue = [{ x, y }];
      let openEnds = 0;
      const localVisited = new Set<string>();

      while (queue.length > 0) {
        const cur = queue.shift()!;
        const k = `c${cur.x},${cur.y}`;
        if (localVisited.has(k)) continue;
        localVisited.add(k);
        visited.add(k);

        const placed = board[cur.y]?.[cur.x];
        if (!placed) continue;
        tiles.push(cur);
        const ce = getEdges(placed.tile);

        const dirs = [
          { dx: 0, dy: -1, idx: 0 },
          { dx: 1, dy: 0, idx: 1 },
          { dx: 0, dy: 1, idx: 2 },
          { dx: -1, dy: 0, idx: 3 },
        ];

        for (const d of dirs) {
          if (ce[d.idx] === 'city') {
            const nx = cur.x + d.dx;
            const ny = cur.y + d.dy;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE || !board[ny][nx]) {
              openEnds++;
            } else {
              const ne = getEdges(board[ny][nx].tile);
              if (ne[getOpposite(d.idx)] === 'city') {
                if (!localVisited.has(`c${nx},${ny}`)) queue.push({ x: nx, y: ny });
              } else {
                openEnds++;
              }
            }
          }
        }
      }

      if (openEnds === 0 && tiles.length > 0) {
        score += tiles.length * 2;
      }
    }
  }

  // Count completed monasteries
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!board[y][x]?.tile.hasMonastery) continue;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx]) {
            count++;
          }
        }
      }
      if (count >= 9) score += 9;
    }
  }

  return score;
}

// ===== AI =====
function aiMove(board: (PlacedTile | null)[][], tile: TileData): { x: number; y: number; rotation: number } | null {
  const allMoves = findValidWithRotation(board, tile);
  if (allMoves.length === 0) return null;

  let best = allMoves[0];
  let bestScore = -Infinity;

  for (const move of allMoves) {
    let score = 0;
    // Prefer center
    score -= (Math.abs(move.x - CENTER) + Math.abs(move.y - CENTER)) * 0.5;
    // Prefer adjacency
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = move.x + dx;
      const ny = move.y + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx]) {
        score += 3;
      }
    }
    // Monastery bonus
    const rotated = { ...tile, rotation: move.rotation };
    if (rotated.hasMonastery) {
      let adj = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = move.x + dx;
          const ny = move.y + dy;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx]) adj++;
        }
      }
      score += adj * 3;
    }
    // City/road edges
    const edges = getEdges(rotated);
    score += edges.filter(e => e === 'city').length * 2;
    score += edges.filter(e => e === 'road').length;
    score += Math.random() * 2;

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

// ===== SVG Tile Component =====
function TileView({ tile, size }: { tile: TileData; size: number }) {
  const edges = getEdges(tile);
  const [top, right, bottom, left] = edges;
  const h = size / 2;
  const q = size / 4;
  const rw = size * 0.2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grass background */}
      <rect width={size} height={size} fill="#5a8f2f" />

      {/* City edges */}
      {top === 'city' && (
        <g>
          <rect x={q} y={0} width={h} height={q + 1} fill="#8B6914" />
          <rect x={q + 3} y={2} width={h - 6} height={q - 3} fill="#C4A35A" />
          <line x1={h} y1={0} x2={h} y2={q} stroke="#5C4A0E" strokeWidth={1} />
        </g>
      )}
      {right === 'city' && (
        <g>
          <rect x={h + q - 1} y={q} width={q + 1} height={h} fill="#8B6914" />
          <rect x={h + q + 1} y={q + 3} width={q - 3} height={h - 6} fill="#C4A35A" />
          <line x1={h + q} y1={h} x2={size} y2={h} stroke="#5C4A0E" strokeWidth={1} />
        </g>
      )}
      {bottom === 'city' && (
        <g>
          <rect x={q} y={h + q - 1} width={h} height={q + 1} fill="#8B6914" />
          <rect x={q + 3} y={h + q + 1} width={h - 6} height={q - 3} fill="#C4A35A" />
          <line x1={h} y1={h + q} x2={h} y2={size} stroke="#5C4A0E" strokeWidth={1} />
        </g>
      )}
      {left === 'city' && (
        <g>
          <rect x={0} y={q} width={q + 1} height={h} fill="#8B6914" />
          <rect x={3} y={q + 3} width={q - 3} height={h - 6} fill="#C4A35A" />
          <line x1={0} y1={h} x2={q} y2={h} stroke="#5C4A0E" strokeWidth={1} />
        </g>
      )}

      {/* City corners */}
      {top === 'city' && left === 'city' && <rect x={q} y={q} width={q} height={q} fill="#8B6914" />}
      {top === 'city' && right === 'city' && <rect x={h} y={q} width={q} height={q} fill="#8B6914" />}
      {bottom === 'city' && left === 'city' && <rect x={q} y={h} width={q} height={q} fill="#8B6914" />}
      {bottom === 'city' && right === 'city' && <rect x={h} y={h} width={q} height={q} fill="#8B6914" />}

      {/* Road edges */}
      {top === 'road' && <rect x={h - rw / 2} y={0} width={rw} height={q + 1} fill="#E8C84A" />}
      {right === 'road' && <rect x={h + q - 1} y={h - rw / 2} width={q + 1} height={rw} fill="#E8C84A" />}
      {bottom === 'road' && <rect x={h - rw / 2} y={h + q - 1} width={rw} height={q + 1} fill="#E8C84A" />}
      {left === 'road' && <rect x={0} y={h - rw / 2} width={q + 1} height={rw} fill="#E8C84A" />}

      {/* Road center connections */}
      {top === 'road' && bottom === 'road' && <rect x={h - rw / 2} y={q} width={rw} height={h} fill="#E8C84A" />}
      {left === 'road' && right === 'road' && <rect x={q} y={h - rw / 2} width={h} height={rw} fill="#E8C84A" />}
      {(top === 'road' || bottom === 'road') && (left === 'road' || right === 'road') && (
        <rect x={q} y={q} width={h} height={h} fill="#E8C84A" />
      )}

      {/* Monastery */}
      {tile.hasMonastery && (
        <g>
          <circle cx={h} cy={h} r={q - 2} fill="#5D4037" />
          <circle cx={h} cy={h} r={q - 5} fill="#795548" />
          <rect x={h - 1.5} y={h - q + 4} width={3} height={q} fill="#FFCC80" />
          <rect x={h - q + 5} y={h - 1.5} width={h - 10} height={3} fill="#FFCC80" />
        </g>
      )}

      {/* Border */}
      <rect x={0.5} y={0.5} width={size - 1} height={size - 1} fill="none" stroke="#2E1F0F" strokeWidth={1} />
    </svg>
  );
}

// ===== Main App =====
interface GameState {
  board: (PlacedTile | null)[][];
  deck: TileData[];
  currentTile: TileData | null;
  currentRotation: number;
  validPositions: { x: number; y: number }[];
  playerScore: number;
  computerScore: number;
  playerMeeples: number;
  computerMeeples: number;
  meeples: Meeple[];
  turn: 'player' | 'computer';
  phase: 'place_tile' | 'place_meeple' | 'game_over';
  placedPos: { x: number; y: number } | null;
  selectedMeepleType: string | null;
  message: string;
}

function getNextPlayableTile(board: (PlacedTile | null)[][], deck: TileData[]): { tile: TileData; remainingDeck: TileData[]; rotation: number; positions: { x: number; y: number }[] } | null {
  for (let i = 0; i < deck.length; i++) {
    for (let rot = 0; rot < 360; rot += 90) {
      const t = { ...deck[i], rotation: rot };
      const positions = findValidPositions(board, t);
      if (positions.length > 0) {
        const remaining = [...deck.slice(0, i), ...deck.slice(i + 1)];
        return { tile: t, remainingDeck: remaining, rotation: rot, positions };
      }
    }
  }
  return null;
}

function initState(): GameState {
  const board = createBoard();
  const startTile: TileData = {
    id: 'start',
    edges: ['road', 'city', 'field', 'city'],
    hasMonastery: false,
    rotation: 0,
  };
  board[CENTER][CENTER] = { tile: startTile, x: CENTER, y: CENTER };

  const deck = createDeck();
  const next = getNextPlayableTile(board, deck);

  if (!next) {
    return {
      board,
      deck: [],
      currentTile: null,
      currentRotation: 0,
      validPositions: [],
      playerScore: 0,
      computerScore: 0,
      playerMeeples: 7,
      computerMeeples: 7,
      meeples: [],
      turn: 'player',
      phase: 'game_over',
      placedPos: null,
      selectedMeepleType: null,
      message: 'Нет доступных ходов!',
    };
  }

  return {
    board,
    deck: next.remainingDeck,
    currentTile: next.tile,
    currentRotation: next.rotation,
    validPositions: next.positions,
    playerScore: 0,
    computerScore: 0,
    playerMeeples: 7,
    computerMeeples: 7,
    meeples: [],
    turn: 'player',
    phase: 'place_tile',
    placedPos: null,
    selectedMeepleType: null,
    message: 'Ваш ход! Выберите позицию для плитки.',
  };
}

export default function App() {
  const [game, setGame] = useState<GameState>(initState);
  const [thinking, setThinking] = useState(false);

  const handleRotate = useCallback(() => {
    if (game.turn !== 'player' || game.phase !== 'place_tile' || !game.currentTile) return;
    setGame(prev => {
      if (!prev.currentTile) return prev;
      const newRot = (prev.currentRotation + 90) % 360;
      const rotated = { ...prev.currentTile, rotation: newRot };
      const positions = findValidPositions(prev.board, rotated);
      return { ...prev, currentRotation: newRot, validPositions: positions };
    });
  }, [game.turn, game.phase, game.currentTile]);

  const doComputerTurn = useCallback((board: (PlacedTile | null)[][], pScore: number, cScore: number, meeples: Meeple[], cMeeples: number, deck: TileData[]) => {
    setThinking(true);
    setTimeout(() => {
      setGame(prev => {
        if (!prev.currentTile) {
          return { ...prev, phase: 'game_over', message: 'Игра окончена!' };
        }

        const move = aiMove(prev.board, prev.currentTile);
        if (!move) {
          // Can't place, try next tile
          const next = getNextPlayableTile(prev.board, prev.deck);
          if (!next) return { ...prev, phase: 'game_over', message: 'Игра окончена!' };
          return {
            ...prev,
            currentTile: next.tile,
            currentRotation: next.rotation,
            deck: next.remainingDeck,
            validPositions: next.positions,
            message: 'Компьютер пропустил. Ваш ход!',
          };
        }

        const placed = { ...prev.currentTile, rotation: move.rotation };
        const newBoard = prev.board.map(r => [...r]);
        newBoard[move.y][move.x] = { tile: placed, x: move.x, y: move.y };

        // Score
        const totalScore = countCompletedFeatures(newBoard);
        const halfScore = Math.floor(totalScore / 2);
        const newCScore = cScore + halfScore;
        const newPScore = pScore + (totalScore - halfScore);

        // AI meeple placement
        const newMeeples = [...meeples];
        let newCMeeples = cMeeples;
        const edges = getEdges(placed);
        if (cMeeples > 0) {
          let placeType: string | null = null;
          if (placed.hasMonastery) placeType = 'monastery';
          else if (edges.filter(e => e === 'city').length >= 2) placeType = 'city';
          else if (edges.filter(e => e === 'road').length >= 2) placeType = 'road';
          else if (edges.some(e => e === 'city')) placeType = 'city';
          else if (edges.some(e => e === 'road')) placeType = 'road';

          if (placeType) {
            newMeeples.push({ owner: 'computer', x: move.x, y: move.y, position: placeType });
            newCMeeples--;
          }
        }

        // Next tile for player
        const next = getNextPlayableTile(newBoard, prev.deck);
        if (!next) {
          return {
            ...prev,
            board: newBoard,
            deck: [],
            currentTile: null,
            playerScore: newPScore,
            computerScore: newCScore,
            meeples: newMeeples,
            computerMeeples: newCMeeples,
            phase: 'game_over',
            message: 'Игра окончена!',
            turn: 'player',
          };
        }

        return {
          ...prev,
          board: newBoard,
          deck: next.remainingDeck,
          currentTile: next.tile,
          currentRotation: next.rotation,
          validPositions: next.positions,
          playerScore: newPScore,
          computerScore: newCScore,
          meeples: newMeeples,
          computerMeeples: newCMeeples,
          turn: 'player',
          phase: 'place_tile',
          message: 'Ваш ход! Разместите плитку.',
          placedPos: null,
          selectedMeepleType: null,
        };
      });
      setThinking(false);
    }, 700);
  }, []);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (thinking) return;

    if (game.phase === 'place_tile' && game.turn === 'player') {
      const isValid = game.validPositions.some(p => p.x === x && p.y === y);
      if (!isValid || !game.currentTile) return;

      setGame(prev => {
        if (!prev.currentTile) return prev;
        const placed = { ...prev.currentTile, rotation: prev.currentRotation };
        const newBoard = prev.board.map(r => [...r]);
        newBoard[y][x] = { tile: placed, x, y };

        // Check if can place meeple
        const edges = getEdges(placed);
        const canPlace = prev.playerMeeples > 0 && (
          placed.hasMonastery || edges.some(e => e === 'city') || edges.some(e => e === 'road')
        );

        if (canPlace) {
          return {
            ...prev,
            board: newBoard,
            phase: 'place_meeple',
            placedPos: { x, y },
            message: 'Разместите мипл или пропустите.',
          };
        }

        // No meeple, go to computer
        const totalScore = countCompletedFeatures(newBoard);
        const halfScore = Math.floor(totalScore / 2);
        const newPScore = prev.playerScore + (totalScore - halfScore);
        const newCScore = prev.computerScore + halfScore;

        const next = getNextPlayableTile(newBoard, prev.deck);
        if (!next) {
          return {
            ...prev,
            board: newBoard,
            deck: [],
            currentTile: null,
            playerScore: newPScore,
            computerScore: newCScore,
            phase: 'game_over',
            message: 'Игра окончена!',
            turn: 'player',
          };
        }

        setTimeout(() => doComputerTurn(newBoard, newPScore, newCScore, prev.meeples, prev.computerMeeples, next.remainingDeck), 400);

        return {
          ...prev,
          board: newBoard,
          deck: next.remainingDeck,
          currentTile: next.tile,
          currentRotation: next.rotation,
          validPositions: next.positions,
          playerScore: newPScore,
          computerScore: newCScore,
          turn: 'computer',
          phase: 'place_tile',
          message: 'Компьютер думает...',
          placedPos: null,
        };
      });
    } else if (game.phase === 'place_meeple' && game.turn === 'player') {
      if (!game.placedPos || game.placedPos.x !== x || game.placedPos.y !== y) return;
      if (!game.selectedMeepleType) return;

      setGame(prev => {
        const newMeeples = [...prev.meeples, { owner: 'player' as const, x, y, position: prev.selectedMeepleType! }];
        const totalScore = countCompletedFeatures(prev.board);
        const halfScore = Math.floor(totalScore / 2);
        const newPScore = prev.playerScore + (totalScore - halfScore);
        const newCScore = prev.computerScore + halfScore;

        const next = getNextPlayableTile(prev.board, prev.deck);
        if (!next) {
          return {
            ...prev,
            meeples: newMeeples,
            playerMeeples: prev.playerMeeples - 1,
            playerScore: newPScore,
            computerScore: newCScore,
            phase: 'game_over',
            message: 'Игра окончена!',
            turn: 'player',
          };
        }

        setTimeout(() => doComputerTurn(prev.board, newPScore, newCScore, newMeeples, prev.computerMeeples, next.remainingDeck), 400);

        return {
          ...prev,
          meeples: newMeeples,
          playerMeeples: prev.playerMeeples - 1,
          deck: next.remainingDeck,
          currentTile: next.tile,
          currentRotation: next.rotation,
          validPositions: next.positions,
          playerScore: newPScore,
          computerScore: newCScore,
          turn: 'computer',
          phase: 'place_tile',
          message: 'Компьютер думает...',
          placedPos: null,
          selectedMeepleType: null,
        };
      });
    }
  }, [game, thinking, doComputerTurn]);

  const handleSkipMeeple = useCallback(() => {
    if (game.phase !== 'place_meeple') return;
    setGame(prev => {
      const totalScore = countCompletedFeatures(prev.board);
      const halfScore = Math.floor(totalScore / 2);
      const newPScore = prev.playerScore + (totalScore - halfScore);
      const newCScore = prev.computerScore + halfScore;

      const next = getNextPlayableTile(prev.board, prev.deck);
      if (!next) {
        return { ...prev, playerScore: newPScore, computerScore: newCScore, phase: 'game_over', message: 'Игра окончена!' };
      }

      setTimeout(() => doComputerTurn(prev.board, newPScore, newCScore, prev.meeples, prev.computerMeeples, next.remainingDeck), 400);

      return {
        ...prev,
        deck: next.remainingDeck,
        currentTile: next.tile,
        currentRotation: next.rotation,
        validPositions: next.positions,
        playerScore: newPScore,
        computerScore: newCScore,
        turn: 'computer',
        phase: 'place_tile',
        message: 'Компьютер думает...',
        placedPos: null,
        selectedMeepleType: null,
      };
    });
  }, [game.phase, doComputerTurn]);

  const handleNewGame = useCallback(() => {
    setGame(initState());
    setThinking(false);
  }, []);

  // Calculate board bounds
  let minX = CENTER, maxX = CENTER, minY = CENTER, maxY = CENTER;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (game.board[y][x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const tileSize = 48;
  const boardW = (maxX - minX + 3) * tileSize;
  const boardH = (maxY - minY + 3) * tileSize;

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'linear-gradient(135deg, #1a0f00 0%, #0d2818 50%, #0a1f14 100%)', color: 'white', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px 16px', borderBottom: '1px solid rgba(255,180,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: '20px', color: '#FFB800', fontWeight: 'bold' }}>🏰 Каркассон</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#ccc' }}>Плиток: {game.deck.length}</span>
          <button onClick={handleNewGame} style={{ padding: '6px 14px', background: '#B8860B', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
            🔄 Новая игра
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: '220px', padding: '12px', overflowY: 'auto', flexShrink: 0, borderRight: '1px solid rgba(255,180,0,0.15)' }}>
          {/* Score */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid rgba(255,180,0,0.2)' }}>
            <div style={{ fontSize: '12px', color: '#FFB800', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>Счёт</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30,90,200,0.2)', borderRadius: '6px', padding: '8px', marginBottom: '6px' }}>
              <span style={{ color: '#6CB4EE', fontSize: '14px' }}>🔵 Вы</span>
              <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#6CB4EE' }}>{game.playerScore}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(200,30,30,0.2)', borderRadius: '6px', padding: '8px' }}>
              <span style={{ color: '#EE6C6C', fontSize: '14px' }}>🔴 ИИ</span>
              <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#EE6C6C' }}>{game.computerScore}</span>
            </div>
          </div>

          {/* Meeples */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid rgba(255,180,0,0.2)' }}>
            <div style={{ fontSize: '12px', color: '#FFB800', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>Миплы</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ color: '#6CB4EE', fontSize: '13px' }}>Ваши</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{ width: '12px', height: '12px', borderRadius: '50%', background: i < game.playerMeeples ? '#1E5AC8' : '#444' }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#EE6C6C', fontSize: '13px' }}>ИИ</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{ width: '12px', height: '12px', borderRadius: '50%', background: i < game.computerMeeples ? '#C81E1E' : '#444' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Current tile */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid rgba(255,180,0,0.2)' }}>
            <div style={{ fontSize: '12px', color: '#FFB800', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>Плитка</div>
            {game.currentTile && game.turn === 'player' && game.phase === 'place_tile' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <TileView tile={{ ...game.currentTile, rotation: game.currentRotation }} size={80} />
                <button onClick={handleRotate} style={{ width: '100%', padding: '8px', background: '#4A3ACC', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                  🔄 Повернуть
                </button>
              </div>
            )}
            {game.turn === 'computer' && (
              <div style={{ textAlign: 'center', padding: '16px', color: '#aaa' }}>
                <div style={{ fontSize: '28px', marginBottom: '4px' }}>🤔</div>
                <div style={{ fontSize: '12px' }}>Думаю...</div>
              </div>
            )}
          </div>

          {/* Meeple placement */}
          {game.phase === 'place_meeple' && game.turn === 'player' && (
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid rgba(255,200,0,0.5)' }}>
              <div style={{ fontSize: '12px', color: '#FFD700', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>Мипл</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {['city', 'road', 'monastery'].map(type => (
                  <button
                    key={type}
                    onClick={() => setGame(prev => ({ ...prev, selectedMeepleType: type }))}
                    style={{
                      padding: '8px',
                      background: game.selectedMeepleType === type ? '#B8860B' : '#444',
                      color: 'white',
                      border: game.selectedMeepleType === type ? '2px solid #FFD700' : 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '13px',
                    }}
                  >
                    {type === 'city' ? '🏰 Город' : type === 'road' ? '🛤️ Дорога' : '⛪ Монастырь'}
                  </button>
                ))}
                <button onClick={handleSkipMeeple} style={{ padding: '8px', background: '#555', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  ⏭️ Пропустить
                </button>
              </div>
            </div>
          )}

          {/* Message */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '12px', border: '1px solid rgba(255,180,0,0.2)' }}>
            <p style={{ margin: 0, textAlign: 'center', fontSize: '13px', color: '#ddd' }}>{game.message}</p>
          </div>
        </div>

        {/* Board */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: '16px' }}>
          <div style={{ position: 'relative', width: boardW, height: boardH, background: 'rgba(0,80,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,180,0,0.2)', flexShrink: 0 }}>
            {/* Placed tiles */}
            {game.board.map((row, y) =>
              row.map((cell, x) => {
                if (!cell) return null;
                const left = (x - minX + 1) * tileSize;
                const top = (y - minY + 1) * tileSize;
                const isPlaced = game.placedPos?.x === x && game.placedPos?.y === y;
                const meeple = game.meeples.find(m => m.x === x && m.y === y);

                return (
                  <div key={`t${x},${y}`} style={{ position: 'absolute', left, top, outline: isPlaced && game.phase === 'place_meeple' ? '2px solid #FFD700' : 'none', zIndex: isPlaced ? 10 : 1 }}>
                    <TileView tile={cell.tile} size={tileSize} />
                    {meeple && (
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
                        <svg width={16} height={16} viewBox="0 0 20 20">
                          <circle cx="10" cy="5" r="3.5" fill={meeple.owner === 'player' ? '#1E5AC8' : '#C81E1E'} />
                          <path d="M6,18 Q6,11 10,11 Q14,11 14,18 Z" fill={meeple.owner === 'player' ? '#1E5AC8' : '#C81E1E'} />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Valid positions */}
            {game.phase === 'place_tile' && game.turn === 'player' && game.validPositions.map(pos => {
              const left = (pos.x - minX + 1) * tileSize;
              const top = (pos.y - minY + 1) * tileSize;
              return (
                <div
                  key={`v${pos.x},${pos.y}`}
                  onClick={() => handleCellClick(pos.x, pos.y)}
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width: tileSize,
                    height: tileSize,
                    border: '2px dashed rgba(255,200,0,0.6)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,200,0,0.5)',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    transition: 'all 0.15s',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,200,0,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,200,0,0.9)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,200,0,0.6)'; }}
                >
                  +
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rules */}
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 16px', borderTop: '1px solid rgba(255,180,0,0.15)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#aaa', justifyContent: 'center', flexWrap: 'wrap' }}>
          <span>🏰 Город: 2 очка/плитка</span>
          <span>🛤️ Дорога: 1 очко/плитка</span>
          <span>⛪ Монастырь: 9 очков</span>
          <span>🎯 Мипл: захват структуры</span>
        </div>
      </div>

      {/* Game Over */}
      {game.phase === 'game_over' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'linear-gradient(to bottom, #2a2a2a, #1a1a1a)', borderRadius: '16px', padding: '32px', maxWidth: '360px', width: '90%', textAlign: 'center', border: '1px solid rgba(255,180,0,0.3)' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>
              {game.playerScore > game.computerScore ? '🎉' : game.playerScore < game.computerScore ? '😔' : '🤝'}
            </div>
            <h2 style={{ margin: '0 0 4px', color: '#FFB800', fontSize: '24px' }}>
              {game.playerScore > game.computerScore ? 'Победа!' : game.playerScore < game.computerScore ? 'Поражение' : 'Ничья!'}
            </h2>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>Игра окончена</p>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(30,90,200,0.2)', borderRadius: '8px', padding: '10px 16px', marginBottom: '8px' }}>
                <span style={{ color: '#6CB4EE' }}>Вы</span>
                <span style={{ fontWeight: 'bold', fontSize: '20px', color: '#6CB4EE' }}>{game.playerScore}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(200,30,30,0.2)', borderRadius: '8px', padding: '10px 16px' }}>
                <span style={{ color: '#EE6C6C' }}>Компьютер</span>
                <span style={{ fontWeight: 'bold', fontSize: '20px', color: '#EE6C6C' }}>{game.computerScore}</span>
              </div>
            </div>
            <button onClick={handleNewGame} style={{ width: '100%', padding: '12px', background: '#B8860B', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>
              🔄 Играть снова
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
