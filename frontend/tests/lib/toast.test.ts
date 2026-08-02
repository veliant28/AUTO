// tests/setup.ts globally mocks @/lib/toast, so load the real module via
// jest.requireActual to test the toMessage normalization helper.
const { toMessage } =
  jest.requireActual<typeof import('@/lib/toast')>('@/lib/toast')

describe('toMessage', () => {
  it('returns strings as-is', () => {
    expect(toMessage('hello')).toBe('hello')
    expect(toMessage('')).toBe('')
  })

  it('joins pydantic 422 detail issues into a readable message', () => {
    const detail = [
      {
        type: 'string_type',
        loc: ['body', 'service_params'],
        msg: 'Input should be a valid string',
        input: null,
        ctx: { error: {} },
      },
      {
        type: 'missing',
        loc: ['body', 'payer_type'],
        msg: 'Field required',
        input: undefined,
        ctx: undefined,
      },
    ]
    expect(toMessage(detail)).toBe(
      'Input should be a valid string; Field required',
    )
  })

  it('extracts msg/message from objects', () => {
    expect(toMessage({ msg: 'boom' })).toBe('boom')
    expect(toMessage({ message: 'boom' })).toBe('boom')
  })

  it('stringifies unknown objects', () => {
    expect(toMessage({ foo: 1 })).toBe('{"foo":1}')
  })

  it('uses Error.message', () => {
    expect(toMessage(new Error('network failed'))).toBe('network failed')
  })

  it('handles null, undefined and primitives', () => {
    expect(toMessage(null)).toBe('')
    expect(toMessage(undefined)).toBe('')
    expect(toMessage(42)).toBe('42')
  })

  it('handles nested arrays', () => {
    expect(toMessage([{ msg: 'a' }, ['b', null]])).toBe('a; b')
  })
})
