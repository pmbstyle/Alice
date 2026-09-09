import { describe, expect, it } from 'vitest'
import {
  hasSecretValues,
  mergeSecretSettings,
  splitSecretSettings,
} from '../../electron/main/settingsSecurity'

describe('settings secret boundaries', () => {
  it('keeps secrets out of the public settings record', () => {
    const result = splitSecretSettings({
      VITE_OPENAI_API_KEY: 'sk-test',
      VITE_API_ROUTE_API_KEY: 'sk-route',
      VITE_QB_PASSWORD: '',
      aiProvider: 'openai',
    })

    expect(result.publicSettings).toEqual({ aiProvider: 'openai' })
    expect(result.secrets).toEqual({
      VITE_OPENAI_API_KEY: 'sk-test',
      VITE_API_ROUTE_API_KEY: 'sk-route',
    })
    expect(result.hadSecretFields).toBe(true)
    expect(hasSecretValues(result.secrets)).toBe(true)
  })

  it('merges protected secrets only at the application boundary', () => {
    expect(
      mergeSecretSettings(
        { aiProvider: 'openai' },
        { VITE_OPENAI_API_KEY: 'sk-test' }
      )
    ).toEqual({
      aiProvider: 'openai',
      VITE_OPENAI_API_KEY: 'sk-test',
    })
  })

  it('does not treat empty credentials as secret values', () => {
    expect(hasSecretValues({ VITE_OPENAI_API_KEY: '' })).toBe(false)
  })

  it('distinguishes partial saves from an explicit credential clear', () => {
    expect(splitSecretSettings({ aiProvider: 'openai' }).hadSecretFields).toBe(
      false
    )
    expect(
      splitSecretSettings({
        aiProvider: 'openai',
        VITE_OPENAI_API_KEY: '',
      }).hadSecretFields
    ).toBe(true)
  })
})
