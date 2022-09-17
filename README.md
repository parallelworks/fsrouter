# fsrouter
Filesystem based router for express.js

# Usage

```typescript
import express, { RequestHandler } from 'express'
import { initFsRouting } from '@parallelworks/fsrouter'
import path from 'path'
const port = 3000

const routesPath = path.join(__dirname, '_routes')


export const getFsRouter = async (routesPath: string) => {
  const skipMiddleware: RequestHandler = (req, res, next) => next()
  const router = await initFsRouting({
    ensureAdmin: skipMiddleware,
    ensureAuthenticated: skipMiddleware,
    routesPath: routesPath,
  })
  return router
}

export default async function main() {
  const router = await getFsRouter(routesPath)
  app.use(express.json())
  app.get('/healthzz', (req, res) => res.status(200).send())
  app.use('/api/v2/stats', router)

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`)
  })
}

```

In the above example, a router is created from a path `_routes`, and the admin and authenticated middleware are effectively disabled by simply calling `next()`.

In a more realistic example, you can define custom middleware functions that determine if a request is authenticated or if the user is an admin.

## **Creating a route**

Routes are declared by exporting a function with the name of an HTTP verb from within one of these files, e.g.

```typescript
export const GET: Endpoint = (req, res) => {}
```

In some cases, you may want to add a custom middleware for a route handler. You can optionally export an array instead and route handlers will be executed in order, for example:

```typescript
export const POST: Endpoint = [
  (req, res, next) => {
    next()
  },
  (req, res) => {
    res.status(200).send()
  },
]
```

## **Special cases**

- If the file is named `index.ts` then it will be the root route for that path.
- If you prefix the filename with a `:` then it will be considered to be an Express [URL parameter](https://expressjs.com/en/guide/routing.html#route-parameters).
- Folders will take priority over files, so if you have a `/api/index.ts` and `/api.ts`, the `index.ts` file will be added first; let's make sure we don't do this though!
- If you need to override the routing system for some reason, files prefixed with `_` will be ignored. e.g. `_index.ts` would not be added to the router.

## **Special exports**

To make a route require admin access, add the following to the endpoint file:

```typescript
export const ensureAdmin = true
```

To make a route public, add the following to the endpoint file:

```typescript
export const guestAccess = true
```

# **Validation**

When you’re using the @parallelworks/fsrouter package, validation is handled with a special export. The [full JSON-schema spec](https://json-schema.org/draft/2020-12/json-schema-core.html#rfc.section.10.3.2.1) is available in these objects, so we can create some advanced validation if necessary.

```typescript
export const validation = {
    GET: {
        query: {
            ...
        }
    }
} as const
```

Where the structure of a query object is a valid [JSON Schema](https://json-schema.org/), e.g. :

```typescript
{
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'The name of the resource',
        },
      },
      required: ['name'],
      additionalProperties: false,
}
```

Exporting this object will make sure that any requests that reach your route handlers are the shape defined in your JSON Schema. Any requests that don't match this shape will receive an error response automatically.

That means the type of the request can be asserted, which is done like this:

```typescript
export const GET: Endpoint<{}, {}, {}, FromSchema<typeof validation.GET.query>> = (req, res) => {
    ...
}
```

Since URL params are handled by the filename, you can also assert their type as string with the following:

```ts
export const GET: Endpoint<{jid: string}, {}, {}, {}> = (req, res) => {
    ...
}
```
