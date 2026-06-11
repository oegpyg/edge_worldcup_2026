import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Post, Patch } from '@nestjs/common';

import { BackofficeService } from './backoffice.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { DemoDistributionDto } from './dto/demo-distribution.dto';
import { DemoResetDto } from './dto/demo-reset.dto';
import { GenerateDemoMatchesDto } from './dto/generate-demo-matches.dto';
import { GenerateDemoPredictionsDto } from './dto/generate-demo-predictions.dto';
import { ImportOfficialsCsvDto } from './dto/import-officials-csv.dto';
import { UpdateOfficialDto } from './dto/update-official.dto';
import { SetMatchResultDto } from './dto/set-match-result.dto';
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

  @Post('officials/import-csv')
  importOfficialsFromCsv(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Body() body: ImportOfficialsCsvDto,
  ) {
    return this.backofficeService.importOfficialsFromCsv(adminToken, body.csvContent, body.clearPreviousData);
  }

  @Patch('officials/:id')
  updateOfficial(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOfficialDto,
  ) {
    return this.backofficeService.updateOfficial(id, body.fullName, body.sex, adminToken);
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
    return this.backofficeService.setPredictionLock(adminToken, body.lockAt, body.stage2LockAt);
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

  @Post('demo-reset')
  resetDemoSimulation(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Body() body: DemoResetDto,
  ) {
    return this.backofficeService.resetDemoSimulation(adminToken, body);
  }

  @Post('demo-distribution')
  generateDemoDistribution(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Body() body: DemoDistributionDto,
  ) {
    return this.backofficeService.generateDemoDistribution(adminToken, body.wave);
  }

  @Post('matches')
  createMatch(@Headers('x-admin-token') adminToken: string | undefined, @Body() body: CreateMatchDto) {
    return this.backofficeService.createMatch(adminToken, body);
  }

  @Post('matches/:id/result')
  setMatchResult(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetMatchResultDto,
  ) {
    return this.backofficeService.setMatchResult(adminToken, id, body.homeScore, body.awayScore);
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
