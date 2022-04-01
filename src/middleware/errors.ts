import {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express'

export class UserFacingError extends Error {
  timestamp: Date
  constructor(public message: string, public statusCode?: number) {
    super(message)
    this.name = 'UserFacingError'
    this.timestamp = new Date()
  }
}

// TODO: Make this a class like UserFacingError
interface IError {
  message: string
  error: boolean
  path: string
  time: Date
  stack?: string
}
const development = process.env.NODE_ENV !== 'production'

export const userFacingErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  next
) => {
  if (err instanceof UserFacingError) {
    console.error(err.toString())
    // TODO: Get status code from error if it exists
    // return the user facing error message
    return res.status(err.statusCode || 500).json({
      error: true,
      message: err.message.toString(),
      timestamp: err.timestamp,
      path: req.originalUrl,
    })
  } else if (development) {
    // go to the default error handler, which shows more details
    return next(err)
  }
  // We're not in development, and this is not a user facing error, return a default "Unknown error"
  return res.status(500).json({
    error: true,
    message: 'Unknown Error',
    timstamp: new Date(),
    path: req.originalUrl,
  })
}

export const defaultErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  next
) => {
  const message = err.message || 'Unknown error'
  console.error(
    'Default error handler shown in development. Following error triggered it: ',
    err
  )
  const body: IError = {
    error: true,
    time: new Date(),
    message,
    path: req.originalUrl,
    stack: err.stack,
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
      console.error('Error in asyncErrorHandler')
      next(e)
    }
  }
}
