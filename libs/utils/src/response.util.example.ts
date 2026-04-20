/**
 * Example usage of ResponseUtil in controllers
 * 
 * This file demonstrates how to use ResponseUtil in your controllers
 * to ensure consistent response formatting across all endpoints.
 */

import { Controller, Get, Post, Body, Param, Query, Delete } from '@nestjs/common';
import { ResponseUtil, ApiResponse, ApiPaginatedResponse, createPaginatedResponse } from '@mintjobs/utils';
import { PaginationDto } from '@mintjobs/common';

// Example: Simple success response
@Controller('example')
export class ExampleController {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponse<any>> {
    const data = { id, name: 'Example' };
    return ResponseUtil.success(data, 'Resource retrieved successfully');
  }

  // Example: Created response (201)
  @Post()
  async create(@Body() createDto: any): Promise<ApiResponse<any>> {
    const data = { id: '123', ...createDto };
    return ResponseUtil.created(data, 'Resource created successfully');
  }

  // Example: Paginated response
  @Get()
  async findAll(@Query() query: PaginationDto): Promise<ApiPaginatedResponse<any>> {
    const items = [{ id: '1' }, { id: '2' }];
    const total = 100;
    const paginated = createPaginatedResponse(
      items,
      total,
      query.page || 1,
      query.limit || 20,
    );
    
    return ResponseUtil.paginated(
      paginated.data,
      paginated.meta,
      'Resources retrieved successfully',
    );
  }

  // Example: No content response (204)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    // Delete logic here
    return ResponseUtil.noContent();
  }

  // Example: Custom status response
  @Post('custom')
  async customAction(@Body() dto: any): Promise<ApiResponse<any>> {
    const data = { result: 'custom' };
    return ResponseUtil.withStatus(data, 202, 'Action accepted');
  }
}
