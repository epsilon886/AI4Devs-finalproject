import {
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
import { ResourceIdParamDto } from '../common/dto/resource-id-param.dto';
import { JsonContentTypeGuard } from '../common/guards/json-content-type.guard';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JsonContentTypeGuard)
  create(
    @Req() request: Request & { user: { sub: string } },
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.create(request.user.sub, dto);
  }

  @Get()
  findAll(
    @Req() request: Request & { user: { sub: string } },
    @Query() query: ApplicationQueryDto,
  ) {
    return this.applicationsService.findAll(request.user.sub, query);
  }

  @Get(':id')
  findOne(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: ResourceIdParamDto,
  ) {
    return this.applicationsService.findOne(request.user.sub, id);
  }

  @Patch(':id')
  @UseGuards(JsonContentTypeGuard)
  update(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: ResourceIdParamDto,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(request.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: Request & { user: { sub: string } },
    @Param() { id }: ResourceIdParamDto,
  ) {
    return this.applicationsService.remove(request.user.sub, id);
  }
}
