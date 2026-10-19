import type { Kind } from '../core/sim'
// Levels are data. Levers/lamps are fixed; expect() maps lever bits -> lamp bits (in the listed order).
export interface Level {
  id: string; title: string; brief: string; w: number; h: number
  levers: [number, number][]; lamps: [number, number][]
  toolbox: Kind[]; expect: (i: number[]) => number[]; par: number
}
const b = { w: 14, h: 9 }
export const LEVELS: Level[] = [
  { ...b, id: 'light', title: 'Light it up', brief: 'Wire the lever to the lamp.',
    levers: [[1, 4]], lamps: [[12, 4]], toolbox: ['WIRE'], expect: (i) => [i[0]], par: 0 },
  { ...b, id: 'cross', title: 'Crossing paths', brief: 'Top lever lights the bottom lamp and the bottom lever lights the top lamp. Use a Crossing block where the wires meet.',
    levers: [[1, 2], [1, 6]], lamps: [[12, 2], [12, 6]], toolbox: ['WIRE', 'CROSS'], expect: (i) => [i[1], i[0]], par: 0 },
  { ...b, id: 'not', title: 'Inverter', brief: 'The lamp is ON when the lever is OFF. Gates output on their arrow side; press R to rotate.',
    levers: [[1, 4]], lamps: [[12, 4]], toolbox: ['WIRE', 'NOT'], expect: (i) => [1 - i[0]], par: 1 },
  { ...b, id: 'and', title: 'Both switches', brief: 'The lamp lights only when both levers are ON.',
    levers: [[1, 3], [1, 5]], lamps: [[12, 4]], toolbox: ['WIRE', 'AND'], expect: (i) => [i[0] & i[1]], par: 1 },
  { ...b, id: 'or', title: 'Either switch', brief: 'Light the lamp when at least one lever is ON. Try the single-side wire mode (click a wire with the pointer) to keep branches apart.',
    levers: [[1, 3], [1, 5]], lamps: [[12, 4]], toolbox: ['WIRE', 'CROSS', 'OR'], expect: (i) => [i[0] | i[1]], par: 1 },
  { ...b, id: 'xor', title: 'Exclusive', brief: 'Build XOR from AND, OR and NOT: ON when exactly one lever is ON.',
    levers: [[1, 3], [1, 5]], lamps: [[12, 4]], toolbox: ['WIRE', 'CROSS', 'AND', 'OR', 'NOT'], expect: (i) => [i[0] ^ i[1]], par: 4 },
  { ...b, id: 'half', title: 'Half adder', brief: 'Top lamp = SUM (A xor B), bottom lamp = CARRY (A and B).',
    levers: [[1, 3], [1, 5]], lamps: [[12, 3], [12, 5]], toolbox: ['WIRE', 'CROSS', 'AND', 'OR', 'NOT', 'XOR'], expect: (i) => [i[0] ^ i[1], i[0] & i[1]], par: 2 },
  { ...b, id: 'nand', title: 'NAND challenge', brief: 'Build a NAND output: the lamp should be OFF only when both switches are ON.',
    levers: [[1, 3], [1, 5]], lamps: [[12, 4]], toolbox: ['WIRE', 'CROSS', 'AND', 'NOT', 'NAND'], expect: (i) => [1 - (i[0] & i[1])], par: 1 },
  { ...b, id: 'xnor', title: 'Match the signals', brief: 'Light the lamp when both switches match: both OFF or both ON.',
    levers: [[1, 3], [1, 5]], lamps: [[12, 4]], toolbox: ['WIRE', 'CROSS', 'XOR', 'NOT', 'XNOR'], expect: (i) => [1 - (i[0] ^ i[1])], par: 1 },
  { ...b, id: 'majority', title: 'Majority vote', brief: 'Three inputs vote. The lamp turns on when at least two switches are ON.',
    levers: [[1, 2], [1, 4], [1, 6]], lamps: [[12, 4]], toolbox: ['WIRE', 'CROSS', 'AND', 'OR'], expect: (i) => [(i[0] + i[1] + i[2]) >= 2 ? 1 : 0], par: 3 },
]
