import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, ValidateNested } from 'class-validator';
import { createValidationPipe } from './create-validation-pipe';

class ValidPayload {
  @IsString()
  name!: string;
}

class StagePayload {
  @IsInt()
  position!: number;
}

class StagesPayload {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StagePayload)
  stages!: StagePayload[];
}

function bodyMetadata(metatype: ArgumentMetadata['metatype']): ArgumentMetadata {
  return { type: 'body', metatype };
}

describe('createValidationPipe', () => {
  it('transforms a valid payload into its DTO instance', async () => {
    const result = await createValidationPipe().transform(
      { name: 'RecruitLane' },
      bodyMetadata(ValidPayload),
    );

    expect(result).toBeInstanceOf(ValidPayload);
    expect(result).toEqual({ name: 'RecruitLane' });
  });

  it('rejects properties that are not declared by the DTO', async () => {
    try {
      await createValidationPipe().transform(
        { name: 'RecruitLane', unexpected: true },
        bodyMetadata(ValidPayload),
      );
      fail('Expected validation to reject an undeclared property');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        errors: [
          {
            field: 'unexpected',
            message: 'property unexpected should not exist',
          },
        ],
      });
    }
  });

  it('uses dot notation with an index for nested validation errors', async () => {
    try {
      await createValidationPipe().transform(
        { stages: [{ position: 'first' }] },
        bodyMetadata(StagesPayload),
      );
      fail('Expected validation to reject an invalid nested value');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        errors: [
          {
            field: 'stages.0.position',
            message: 'position must be an integer number',
          },
        ],
      });
    }
  });
});
