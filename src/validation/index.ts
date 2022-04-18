import ajv from 'ajv/dist/2020'
import { RequestHandler } from 'express'

const Ajv = new ajv({ coerceTypes: true })

interface createQueryValidatorParams {
  query?: any
}

export const createQueryValidator = (
  params?: createQueryValidatorParams
): RequestHandler => {
  if (!params) {
    return (req, res, next) => next()
  }
  const validateQuery = Ajv.compile(params.query)

  const validateMiddleware: RequestHandler = (req, res, next) => {
    const queryValid = validateQuery(req.query)

    if (!queryValid) {
      return res.status(400).json({
        error: true,
        message: 'Query parameter validation error',
        errors: validateQuery.errors,
      })
    }
    next()
  }
  return validateMiddleware
}

interface createBodyValidatorParams {
  body?: any
}

export const createBodyValidator = (
  params?: createBodyValidatorParams
): RequestHandler => {
  if (!params) {
    return (req, res, next) => next()
  }
  const validateBody = Ajv.compile(params.body)

  const validateMiddleware: RequestHandler = (req, res, next) => {
    const bodyValid = validateBody(req.body)
    if (!bodyValid) {
      return res.status(400).json({
        error: true,
        message: 'Body parameter validation error',
        errors: validateBody.errors,
      })
    }
    next()
  }
  return validateMiddleware
}
