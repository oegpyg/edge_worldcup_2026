import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Post } from '@nestjs/common';

import { BackofficeService } from './backoffice.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { GenerateDemoMatchesDto } from './dto/generate-demo-matches.dto';
import { GenerateDemoPredictionsDto } from './dto/generate-demo-predictions.dto';
import { SetPredictionLockDto } from './dto/set-prediction-lock.dto';

@Controller('backoffice')
export class BackofficeController {
  constructor(private readonly backofficeService: BackofficeService) {}

  @Post('auth/login')
  adminLogin(@Body() body: AdminLoginDto) {
    return this.backofficeService.adminLogin(body.username, body.password);
  }

  @Get('countries')
  listCountries(@Headers('x-admin-token') adminToken?: string) {
    return this.backofficeService.listCountries(adminToken);
  }

  @Post('countries')
  createCountry(@Headers('x-admin-token') adminToken: string | undefined, @Body() body: CreateCountryDto) {
    return this.backofficeService.createCountry(adminToken, body);
  }

  @Delete('countries/:id')
  deleteCountry(@Headers('x-admin-token') adminToken: string | undefined, @Param('id', ParseIntPipe) id: number) {
    return this.backofficeService.deleteCountry(adminToken, id);
  }

  @Get('matches')
  listMatches(@Headers('x-admin-token') adminToken?: string) {
    return this.backofficeService.listMatches(adminToken);
  }

  @Get('officials')
  listOfficials(@Headers('x-admin-token') adminToken?: string) {
    return this.backofficeService.listOfficials(adminToken);
  }

  @Get('prediction-lock')
  getPredictionLock(@Headers('x-admin-token') adminToken?: string) {
    return this.backofficeService.getPredictionLock(adminToken);
  }

  @Post('prediction-lock')
  setPredictionLock(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Body() body: SetPredictionLockDto,
  ) {
    return this.backofficeService.setPredictionLock(adminToken, body.lockAt);
  }

  @Post('demo-predictions')
  generateDemoPredictions(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Body() body: GenerateDemoPredictionsDto,
  ) {
    return this.backofficeService.generateDemoPredictions(adminToken, body.count);
  }

  @Post('demo-matches')
  generateDemoMatches(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Body() body: GenerateDemoMatchesDto,
  ) {
    return this.backofficeService.generateDemoMatches(adminToken, body.count);
  }

  @Post('matches')
  createMatch(@Headers('x-admin-token') adminToken: string | undefined, @Body() body: CreateMatchDto) {
    return this.backofficeService.createMatch(adminToken, body);
  }

  @Delete('matches/:id')
  deleteMatch(@Headers('x-admin-token') adminToken: string | undefined, @Param('id', ParseIntPipe) id: number) {
    return this.backofficeService.deleteMatch(adminToken, id);
  }

  @Post('import')
  importFromApi(@Headers('x-admin-token') adminToken?: string) {
    return this.backofficeService.importFromApiWithFallback(adminToken);
  }
}
