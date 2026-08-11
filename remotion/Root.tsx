import React from 'react'
import { Composition } from 'remotion'
import { BamakorPromo } from './BamakorPromo'
import { PROMO_DURATION_FRAMES, PROMO_FPS, PROMO_HEIGHT, PROMO_WIDTH } from './constants'

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BamakorPromo"
        component={BamakorPromo}
        durationInFrames={PROMO_DURATION_FRAMES}
        fps={PROMO_FPS}
        width={PROMO_WIDTH}
        height={PROMO_HEIGHT}
      />
    </>
  )
}
