import {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express'

export class UserFacingError extends Error {
  timestamp: Date
  fields: Record<string, unknown> = {}
  constructor(public message: string, public statusCode?: number) {
    super(message)
    this.name = 'UserFacingError'
    this.timestamp = new Date()
  }
}

export const isUserFacingError = (err: unknown): err is UserFacingError => {
  return err instanceof UserFacingError
}

// TODO: Make this a class like UserFacingError
interface IError {
  message: string
  error: boolean
  path: string
  time: Date
  stack?: string
}
// node refuses to send a status outside of this range, and anything below 400 is not an error
const getStatusCode = (statusCode: unknown) => {
  return typeof statusCode === 'number' &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 599
    ? statusCode
    : 500
}

// read on every request, so that it does not depend on when this module was imported
const isDevelopment = () => process.env.NODE_ENV !== 'production'

export const userFacingErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  next
) => {
  // the response has already started, so only express can finish handling this
  if (res.headersSent) {
    return next(err)
  }
  if (isUserFacingError(err)) {
    console.error(err.toString())
    // TODO: Get status code from error if it exists
    // return the user facing error message
    return res.status(getStatusCode(err.statusCode)).json({
      ...err.fields,
      error: true,
      message: String(err.message),
      timestamp: err.timestamp,
      path: req.originalUrl,
    })
  } else if (isDevelopment()) {
    // go to the default error handler, which shows more details
    return next(err)
  }
  // We're not in development, and this is not a user facing error, return a default "Unknown error"
  console.error('Unknown error returned on path:', req.originalUrl, String(err))
  return res.status(500).json({
    error: true,
    message: 'Unknown Error',
    timestamp: new Date(),
    path: req.originalUrl,
  })
}

export const defaultErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  next
) => {
  console.error('Default error handler reached with the following error:', err)
  if (res.headersSent) {
    return next(err)
  }
  // internal error details are only returned outside of production
  const development = isDevelopment()
  const body: IError = {
    error: true,
    time: new Date(),
    message: (development && err?.message) || 'Unknown error',
    path: req.originalUrl,
    stack: development ? err?.stack : undefined,
  }
  return res.status(500).json(body)
}

// This is used to wrap async functions
export const asyncErrorHandler = function wrap(fn: RequestHandler) {
  return async function (req: Request, res: Response, next: NextFunction) {
    // catch both synchronous exceptions and asynchronous rejections
    try {
      // await the function, if it throws, then go to an error handler

      await fn(req, res, next)
    } catch (e) {
      // express treats a falsy value as success and 'route'/'router' as a skip, either of
      // which would let the request past this handler, so always pass along a real error
      if (!e || e === 'route' || e === 'router') {
        return next(new Error(`Handler threw a non-error value: ${String(e)}`))
      }
      next(e)
    }
  }
}
