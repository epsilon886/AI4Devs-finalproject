import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

interface ValidationIssue {
  field: string;
  message: string;
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentField?: string,
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = error.property
      ? parentField
        ? `${parentField}.${error.property}`
        : error.property
      : (parentField ?? 'body');
    const issues = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));

    return [...issues, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        errors: flattenValidationErrors(errors),
      }),
  });
}
