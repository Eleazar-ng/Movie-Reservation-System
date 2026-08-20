import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';


interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

// The shape nestjs-zod's ZodValidationException documents and guarantees
// for its HTTP response body, regardless of whether zod v3, v4, or
// zod-mini is installed underneath. We deliberately do NOT use
// `exception.getZodError()` here — as of nestjs-zod v5 it returns `unknown`
// by design (the library supports "bring your own zod", so it can no
// longer promise a concrete ZodError shape). Reading the public response
// body instead is the version-stable way to get field-level messages.
interface ZodValidationResponseBody {
  statusCode: number;
  message: string;
  errors?: Array<{ path: (string | number)[]; message: string }>;
}

/**
 * Every error the API returns — validation, not-found, unhandled — goes
 * through this filter so clients always get the same JSON shape. Full
 * observability wiring (structured logging, error tracking sink) is a
 * Stage 10 concern; this establishes the contract now so nothing has to
 * change shape later.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      const body = exception.getResponse() as ZodValidationResponseBody;
      message = body.errors?.length
        ? body.errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        : body.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      error = HttpStatus[status] ?? 'Error';
      message = typeof body === 'string' ? body : ((body as any).message ?? exception.message);
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const payload: ErrorResponseBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`, exception instanceof Error ? exception.stack : undefined);
    }

    response.status(status).json(payload);
  }
}
