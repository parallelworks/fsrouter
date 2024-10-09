// this needs to be here before importing to mimic production
process.env.NODE_ENV = 'production'

import {
  isUserFacingError,
  UserFacingError,
  userFacingErrorHandler,
} from './errors'

class extendedError extends UserFacingError {
  hi: string
  constructor(someParam: string) {
    super('This extends userfacingerror', 400)
    this.hi = someParam
  }
}

describe('user facing errors', () => {
  it('identifies user facing errors', () => {
    const error = new UserFacingError('This is a user facing error')
    expect(isUserFacingError(error)).toBe(true)
  })

  it('identifies non-user facing errors', () => {
    const error = new Error('This is a normal error')
    expect(isUserFacingError(error)).toBe(false)
  })

  it('identifies extended user facing errors', () => {
    class extendedError extends UserFacingError {}
    const error = new extendedError('This is a user facing error')
    expect(isUserFacingError(error)).toBe(true)
  })
  it('returns all fields of UserFacingErrors', () => {
    let returnValue: Record<string, unknown> = {}
    const error = new extendedError('This is a user facing error')
    const jsonFunc = (input: Record<string, unknown>) => {
      // dont care about the timestamp
      delete input['timestamp']
      returnValue = input
    }
    const res = {
      status: jest.fn().mockImplementation(() => ({
        json: jsonFunc,
      })),
    }
    const req = {
      originalUrl: '/test',
      method: 'GET',
    }

    const next = jest.fn()

    // @ts-expect-error types dont match
    userFacingErrorHandler(error, req, res, next)
    expect(returnValue).toEqual({
      name: 'UserFacingError',
      statusCode: 400,
      error: true,
      message: 'This extends userfacingerror',
      path: '/test',
      hi: 'This is a user facing error',
    })
  })
  it('returns some fields of UnknownErrors', () => {
    let returnValue: Record<string, unknown> = {}
    const error = new Error('This is a regular error')
    const jsonFunc = (input: Record<string, unknown>) => {
      console.log('@@', input)
      // dont care about the timestamp
      delete input['timestamp']
      returnValue = input
    }
    const res = {
      status: jest.fn().mockImplementation(() => ({
        json: jsonFunc,
      })),
    }
    const req = {
      originalUrl: '/test',
      method: 'GET',
    }

    const next = jest.fn()

    // @ts-expect-error types dont match
    userFacingErrorHandler(error, req, res, next)
    expect(returnValue).toEqual({
      error: true,
      message: 'Unknown Error',
      path: req.originalUrl,
    })
  })
})
