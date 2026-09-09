import { describe, expect, it } from 'vitest'
import {
  DEEPSEEK_TEXT_MODELS,
  CODEX_TEXT_MODELS,
  MINIMAX_TEXT_MODELS,
  ZAI_CODING_MODELS,
  getSafeProviderModel,
  getStaticModelsForProvider,
} from '../providerCatalog'

describe('providerCatalog', () => {
  it('exposes Z.ai Coding Plan models with API model ids', () => {
    expect(getStaticModelsForProvider('zai').map(model => model.id)).toEqual([
      'glm-5.2',
      'glm-5.1',
      'glm-5-turbo',
      'glm-4.7',
      'glm-4.5-air',
    ])
    expect(ZAI_CODING_MODELS[0]?.displayName).toBe('GLM-5.2')
  })

  it('falls back to the Z.ai default for non-coding model ids', () => {
    expect(getSafeProviderModel('zai', 'gpt-4o-mini')).toBe('glm-5.2')
    expect(getSafeProviderModel('zai', 'glm-5.2')).toBe('glm-5.2')
    expect(getSafeProviderModel('zai', 'glm-5-turbo')).toBe('glm-5-turbo')
  })

  it('exposes MiniMax text models with API model ids', () => {
    expect(
      getStaticModelsForProvider('minimax').map(model => model.id)
    ).toEqual([
      'MiniMax-M3',
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.5-highspeed',
    ])
    expect(MINIMAX_TEXT_MODELS[0]?.displayName).toBe('MiniMax M3')
  })

  it('falls back to the MiniMax default for non-MiniMax model ids', () => {
    expect(getSafeProviderModel('minimax', 'gpt-4o-mini')).toBe('MiniMax-M3')
    expect(getSafeProviderModel('minimax', 'MiniMax-M2.5')).toBe('MiniMax-M2.5')
  })

  it('exposes DeepSeek text models with current API model ids', () => {
    expect(
      getStaticModelsForProvider('deepseek').map(model => model.id)
    ).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
    expect(DEEPSEEK_TEXT_MODELS[0]?.displayName).toBe('DeepSeek V4 Flash')
  })

  it('falls back to the DeepSeek default for old model aliases', () => {
    expect(getSafeProviderModel('deepseek', 'deepseek-chat')).toBe(
      'deepseek-v4-flash'
    )
    expect(getSafeProviderModel('deepseek', 'deepseek-v4-pro')).toBe(
      'deepseek-v4-pro'
    )
  })

  it('exposes Codex subscription models with safe fallbacks', () => {
    expect(getStaticModelsForProvider('codex').map(model => model.id)).toEqual([
      'gpt-5.4',
      'gpt-5.2-codex',
      'gpt-5.1-codex-max',
      'gpt-5.4-mini',
      'gpt-5.3-codex',
      'gpt-5.3-codex-spark',
      'gpt-5.2',
      'gpt-5.1-codex-mini',
    ])
    expect(CODEX_TEXT_MODELS[0]?.displayName).toBe('GPT-5.4')
    expect(getSafeProviderModel('codex', 'gpt-4o-mini')).toBe('gpt-5.4')
    expect(getSafeProviderModel('codex', 'gpt-5.4-mini')).toBe('gpt-5.4-mini')
    expect(getSafeProviderModel('codex', 'gpt-5.1-codex')).toBe('gpt-5.1-codex')
  })

  it('accepts dynamically discovered API Route models', () => {
    expect(getStaticModelsForProvider('api-route')).toEqual([])
    expect(getSafeProviderModel('api-route', '')).toBe('gpt-5.4-mini')
    expect(getSafeProviderModel('api-route', 'claude-sonnet-4-5')).toBe(
      'claude-sonnet-4-5'
    )
  })
})
