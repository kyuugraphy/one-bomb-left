import { describe, expect, it } from 'vitest'
import { edgePoint } from './pings.js'

// The real ping ring: the 1344x840 viewport inset by the arrow's margin.
const HALF_WIDTH = 1344 / 2 - 30
const HALF_HEIGHT = 840 / 2 - 30
const CLOSE = 1e-9

// How far out of the rectangle a point sits: 1 is exactly on the edge.
const onEdge = ({ x, y }, halfWidth = HALF_WIDTH, halfHeight = HALF_HEIGHT) =>
  Math.max(Math.abs(x) / halfWidth, Math.abs(y) / halfHeight)

const sweep = (count = 360) =>
  Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2 - Math.PI)

describe('edgePoint', () => {
  it('sends the four axis directions to the middle of their own edge', () => {
    expect(edgePoint(0, 100, 50).x).toBeCloseTo(100)
    expect(edgePoint(0, 100, 50).y).toBeCloseTo(0)
    expect(edgePoint(Math.PI, 100, 50).x).toBeCloseTo(-100)
    expect(edgePoint(Math.PI / 2, 100, 50).y).toBeCloseTo(50)
    expect(edgePoint(-Math.PI / 2, 100, 50).y).toBeCloseTo(-50)
  })

  // A ray running flat along an axis is parallel to two of the edges. Letting one of
  // those win would put the arrow off the screen entirely, or at 0/0.
  it('never lets an edge a ray is parallel to win', () => {
    ;[0, Math.PI, Math.PI / 2, -Math.PI / 2].forEach((angle) => {
      const point = edgePoint(angle, 100, 50)

      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
      expect(onEdge(point, 100, 50)).toBeCloseTo(1)
    })
  })

  it('lands exactly on the corner when aimed at it', () => {
    const point = edgePoint(Math.atan2(HALF_HEIGHT, HALF_WIDTH), HALF_WIDTH, HALF_HEIGHT)

    expect(point.x).toBeCloseTo(HALF_WIDTH)
    expect(point.y).toBeCloseTo(HALF_HEIGHT)
  })

  // The whole point of the min(): a diagonal must stop at the first edge it meets, not
  // run on to the far one and leave the arrow outside the screen.
  it('stays on the edge for every direction, never outside it', () => {
    sweep().forEach((angle) => expect(onEdge(edgePoint(angle, HALF_WIDTH, HALF_HEIGHT))).toBeCloseTo(1))
  })

  it('touches all four edges as it goes round, not just the long ones', () => {
    const touched = new Set()

    sweep().forEach((angle) => {
      const { x, y } = edgePoint(angle, HALF_WIDTH, HALF_HEIGHT)

      if (Math.abs(Math.abs(x) / HALF_WIDTH - 1) < 1e-6) touched.add(x > 0 ? 'right' : 'left')
      if (Math.abs(Math.abs(y) / HALF_HEIGHT - 1) < 1e-6) touched.add(y > 0 ? 'bottom' : 'top')
    })

    expect(touched).toEqual(new Set(['left', 'right', 'top', 'bottom']))
  })

  // An arrow has to point at the enemy, so the offset must keep the angle it was given.
  it('keeps the direction it was asked for', () => {
    sweep(72).forEach((angle) => {
      const { x, y } = edgePoint(angle, HALF_WIDTH, HALF_HEIGHT)

      expect(Math.atan2(y, x)).toBeCloseTo(Math.atan2(Math.sin(angle), Math.cos(angle)))
    })
  })

  it('is symmetric through the centre', () => {
    sweep(72).forEach((angle) => {
      const near = edgePoint(angle, HALF_WIDTH, HALF_HEIGHT)
      const far = edgePoint(angle + Math.PI, HALF_WIDTH, HALF_HEIGHT)

      expect(near.x + far.x).toBeLessThan(CLOSE + Math.abs(near.x) * 1e-9)
      expect(near.y + far.y).toBeLessThan(CLOSE + Math.abs(near.y) * 1e-9)
    })
  })

  it('scales with the rectangle rather than assuming one size', () => {
    const angle = 0.7
    const small = edgePoint(angle, 50, 25)
    const large = edgePoint(angle, 100, 50)

    expect(large.x).toBeCloseTo(small.x * 2)
    expect(large.y).toBeCloseTo(small.y * 2)
  })
})
