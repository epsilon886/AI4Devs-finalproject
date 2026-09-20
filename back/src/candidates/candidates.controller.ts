import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JsonContentTypeGuard } from '../common/guards/json-content-type.guard';
import { CandidateIdParamDto } from './dto/candidate-id-param.dto';
import { CandidatesPaginationDto } from './dto/candidates-pagination.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CandidatesService } from './candidates.service';

@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JsonContentTypeGuard)
  create(
    @Req() request: Request & { user: { sub: string } },
    @Body() createCandidateDto: CreateCandidateDto,
  ) {
    return this.candidatesService.create(request.user.sub, createCandidateDto);
  }

  @Get()
  findAll(
    @Req() request: Request & { user: { sub: string } },
    @Query() pagination: CandidatesPaginationDto,
  ) {
    return this.candidatesService.findAll(request.user.sub, pagination);
  }

  @Get(':id')
  findOne(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: CandidateIdParamDto,
  ) {
    return this.candidatesService.findOne(request.user.sub, id);
  }

  @Patch(':id')
  @UseGuards(JsonContentTypeGuard)
  update(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: CandidateIdParamDto,
    @Body() updateCandidateDto: UpdateCandidateDto,
  ) {
    if (
      updateCandidateDto.firstName === undefined &&
      updateCandidateDto.lastName === undefined &&
      updateCandidateDto.email === undefined &&
      updateCandidateDto.phone === undefined
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        errors: [{ field: 'body', message: 'body must not be empty' }],
      });
    }

    return this.candidatesService.update(
      request.user.sub,
      id,
      updateCandidateDto,
    );
  }
}
