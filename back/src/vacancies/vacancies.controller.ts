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
import { ResourceIdParamDto } from '../common/dto/resource-id-param.dto';
import { JsonContentTypeGuard } from '../common/guards/json-content-type.guard';
import { CreateVacancyDto } from './dto/create-vacancy.dto';
import { UpdateVacancyDto } from './dto/update-vacancy.dto';
import { VacancyQueryDto } from './dto/vacancy-query.dto';
import { VacanciesService } from './vacancies.service';

@Controller('vacancies')
export class VacanciesController {
  constructor(private readonly vacanciesService: VacanciesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JsonContentTypeGuard)
  create(
    @Req() request: Request & { user: { sub: string } },
    @Body() dto: CreateVacancyDto,
  ) {
    return this.vacanciesService.create(request.user.sub, dto);
  }

  @Get()
  findAll(
    @Req() request: Request & { user: { sub: string } },
    @Query() pagination: VacancyQueryDto,
  ) {
    return this.vacanciesService.findAll(request.user.sub, pagination);
  }

  @Get(':id')
  findOne(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: ResourceIdParamDto,
  ) {
    return this.vacanciesService.findOne(request.user.sub, id);
  }

  @Patch(':id')
  @UseGuards(JsonContentTypeGuard)
  update(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: ResourceIdParamDto,
    @Body() dto: UpdateVacancyDto,
  ) {
    const hasDescriptiveField =
      dto.title !== undefined ||
      dto.companyName !== undefined ||
      dto.description !== undefined;
    if (
      (!hasDescriptiveField && dto.status === undefined) ||
      (hasDescriptiveField && dto.status !== undefined)
    ) {
      throw invalidUpdateBody();
    }
    return this.vacanciesService.update(request.user.sub, id, dto);
  }
}

function invalidUpdateBody(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: 'Invalid request data',
    errors: [{ field: 'body', message: 'body must not be empty' }],
  });
}
