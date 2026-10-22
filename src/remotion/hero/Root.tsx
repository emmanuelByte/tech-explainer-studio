import { useEffect, useState } from 'react'
import { Composition, continueRender, delayRender } from 'remotion'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/kalam/700.css'
import '@fontsource/jetbrains-mono/600.css'
import { CachingHero } from './CachingHero'
import { HERO } from './config'

const WithFonts = () => {
  const [handle] = useState(() => delayRender('fonts'))
  useEffect(() => {
    Promise.all(
      ['400 20px "IBM Plex Sans"', '600 20px "IBM Plex Sans"', '700 20px "IBM Plex Sans"', '700 20px Kalam', '600 20px "JetBrains Mono"'].map((f) => document.fonts.load(f)),
    ).then(() => continueRender(handle))
  }, [handle])
  return <CachingHero />
}

export const HeroRoot = () => <Composition id="CachingHero" component={WithFonts} {...HERO} />
