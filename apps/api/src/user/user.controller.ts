import { Body, Controller, Get, Headers, Post } from '@nestjs/common';

import { SavePredictionDto } from './dto/save-prediction.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('panel-data')
  getPanelData(@Headers('x-session-token') sessionToken: string | undefined) {
    return this.userService.getPanelData(sessionToken);
  }

  @Post('prediction')
  savePrediction(
    @Headers('x-session-token') sessionToken: string | undefined,
    @Body() body: SavePredictionDto,
  ) {
    return this.userService.savePrediction(sessionToken, body);
  }
}
