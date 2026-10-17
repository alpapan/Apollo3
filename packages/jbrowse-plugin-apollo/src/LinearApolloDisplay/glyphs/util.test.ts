import type { AnnotationFeature } from '@apollo-annotation/mst'
import { describe, expect, it } from '@jest/globals'

import type { LinearApolloDisplay } from '../stateModel'

import { drawOverlayBox } from './util'

interface FillCall {
  fillStyle: string
  rect: [number, number, number, number]
}

// Records what drawOverlayBox paints, standing in for the browser's canvas.
function recordingContext() {
  const calls: FillCall[] = []
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ fillStyle: this.fillStyle, rect: [x, y, w, h] })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

function featureWithColor(color: string): AnnotationFeature {
  return {
    attributes: new Map([['apollo_color', [color]]]),
  } as unknown as AnnotationFeature
}

const display = {
  theme: {
    palette: {
      action: { disabled: 'rgba(0, 0, 0, 0.26)', focus: 'rgba(0, 0, 0, 0.12)' },
    },
  },
} as unknown as LinearApolloDisplay

describe('drawOverlayBox with a stored highlight colour', () => {
  it.each(['red', '#zzz'])(
    'skips the unusable colour %j without throwing',
    (badColor) => {
      const { calls, ctx } = recordingContext()
      expect(() => {
        drawOverlayBox(
          display,
          ctx,
          1,
          2,
          3,
          4,
          featureWithColor(badColor),
          'highlight',
        )
      }).not.toThrow()
      expect(calls).toEqual([])
    },
  )

  it('paints a parseable colour at 0.3 alpha', () => {
    const { calls, ctx } = recordingContext()
    drawOverlayBox(
      display,
      ctx,
      1,
      2,
      3,
      4,
      featureWithColor('#ff0000'),
      'highlight',
    )
    expect(calls).toEqual([
      { fillStyle: 'rgba(255, 0, 0, 0.3)', rect: [1, 2, 3, 4] },
    ])
  })
})
