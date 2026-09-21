import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ResourceIdParamDto } from '../common/dto/resource-id-param.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { PipelinesService } from './pipelines.service';

@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JsonContentTypeGuard)
  create(
    @Req() request: Request & { user: { sub: string } },
    @Body() dto: CreatePipelineDto,
  ) {
    return this.pipelinesService.create(request.user.sub, dto);
  }

  @Get()
  findAll(
    @Req() request: Request & { user: { sub: string } },
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.pipelinesService.findAll(request.user.sub, pagination);
  }

  @Get(':id')
  findOne(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: ResourceIdParamDto,
  ) {
    return this.pipelinesService.findOne(request.user.sub, id);
  }

  @Patch(':id')
  @UseGuards(JsonContentTypeGuard)
  update(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: ResourceIdParamDto,
    @Body() dto: UpdatePipelineDto,
  ) {
    if (dto.name === undefined && dto.stages === undefined) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        errors: [{ field: 'body', message: 'body must not be empty' }],
      });
    }
    return this.pipelinesService.update(request.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: ResourceIdParamDto,
  ) {
    return this.pipelinesService.remove(request.user.sub, id);
  }
}
