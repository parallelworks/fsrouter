// this needs to be here before importing to mimic production
process.env.NODE_ENV = 'production'

import {
  asyncErrorHandler,
  defaultErrorHandler,
  isUserFacingError,
  UserFacingError,
  userFacingErrorHandler,
} from './errors'

class extendedError extends UserFacingError {
  constructor(someParam: string) {
    super('This extends userfacingerror', 400)
    this.fields = { hi: someParam }
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
    const userError = new UserFacingError('This is a user facing error')
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
      error: true,
      message: 'This extends userfacingerror',
      path: '/test',
      hi: 'This is a user facing error',
    })
    // @ts-expect-error types dont match
    userFacingErrorHandler(userError, req, res, next)
    expect(returnValue).toEqual({
      error: true,
      message: 'This is a user facing error',
      path: '/test',
    })
  })
  it('returns some fields of UnknownErrors', () => {
    let returnValue: Record<string, unknown> = {}
    const error = new Error('This is a regular error')
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
      error: true,
      message: 'Unknown Error',
      path: req.originalUrl,
    })
  })
})

describe('default error handler', () => {
  it('does not return error details in production', () => {
    const json = jest.fn()
    const res = { status: jest.fn().mockImplementation(() => ({ json })) }
    const req = { originalUrl: '/test' }
    jest.spyOn(console, 'error').mockImplementationOnce(() => {})

    // @ts-expect-error types dont match
    defaultErrorHandler(new Error('secret detail'), req, res, jest.fn())
    expect(res.status).toHaveBeenCalledWith(500)
    const body = json.mock.calls[0][0]
    expect(body.message).toBe('Unknown error')
    expect(body.stack).toBeUndefined()
  })
})

describe('async error handler', () => {
  it.each([undefined, null, '', 'route', 'router'])(
    'passes an error to next when a handler throws %p',
    async thrown => {
      const next = jest.fn()
      const handler = asyncErrorHandler(async () => {
        throw thrown
      })
      // @ts-expect-error the request and response are not used
      await handler({}, {}, next)
      expect(next).toHaveBeenCalledTimes(1)
      expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
    }
  )

  it('passes thrown errors to next unchanged', async () => {
    const next = jest.fn()
    const error = new UserFacingError('nope', 400)
    const handler = asyncErrorHandler(async () => {
      throw error
    })
    // @ts-expect-error the request and response are not used
    await handler({}, {}, next)
    expect(next).toHaveBeenCalledWith(error)
  })
})
