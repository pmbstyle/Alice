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
      'glm-5.1',
      'glm-5-turbo',
      'glm-4.7',
      'glm-4.5-air',
    ])
    expect(ZAI_CODING_MODELS[0]?.displayName).toBe('GLM-5.1')
  })

  it('falls back to the Z.ai default for non-coding model ids', () => {
    expect(getSafeProviderModel('zai', 'gpt-4o-mini')).toBe('glm-5.1')
    expect(getSafeProviderModel('zai', 'glm-5-turbo')).toBe('glm-5-turbo')
  })

  it('exposes MiniMax text models with API model ids', () => {
    expect(
      getStaticModelsForProvider('minimax').map(model => model.id)
    ).toEqual(['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2'])
    expect(MINIMAX_TEXT_MODELS[0]?.displayName).toBe('MiniMax M2.7')
  })

  it('falls back to the MiniMax default for non-MiniMax model ids', () => {
    expect(getSafeProviderModel('minimax', 'gpt-4o-mini')).toBe('MiniMax-M2.7')
    expect(getSafeProviderModel('minimax', 'MiniMax-M2.7-highspeed')).toBe(
      'MiniMax-M2.7'
    )
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
      'gpt-5.5',
      'gpt-5.4-mini',
      'gpt-5.2',
    ])
    expect(CODEX_TEXT_MODELS[0]?.displayName).toBe('GPT-5.5')
    expect(getSafeProviderModel('codex', 'gpt-4o-mini')).toBe('gpt-5.5')
    expect(getSafeProviderModel('codex', 'gpt-5.4-mini')).toBe(
      'gpt-5.4-mini'
    )
  })
})
