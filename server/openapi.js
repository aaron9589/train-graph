'use strict';

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'LiveRun Live API',
    version: '1.6.0',
    description:
      'Read-only endpoints intended for external systems such as guard panels, ' +
      'operator displays, and JMRI integrations. ' +
      'All times use `H:MM` format (no leading zero on the hour).',
  },
  tags: [
    { name: 'Live API', description: 'Read-only endpoints for external systems' },
  ],
  components: {
    responses: {
      NotFound: {
        description: 'Not found',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
      },
    },
  },
  paths: {
    '/api/timetables/{id}/live/trains': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Timetable ID' },
      ],
      get: {
        tags: ['Live API'],
        summary: 'List all trains',
        description: 'Returns all trains sorted by start time.',
        responses: {
          200: {
            description: 'Train list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    trains: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', example: 'K351' },
                          trainType: { type: 'string', example: 'L' },
                          trainId: { type: 'string', example: 'CityRail 51L', description: 'Roster/JMRI ID' },
                          direction: { type: 'string', example: 'Down' },
                          notes: { type: 'string' },
                          nextCrewService: {
                            type: 'string',
                            example: 'K352',
                            description: 'Name of the next train this crew member works after this one, if assigned',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/live/trains/{trainName}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Timetable ID' },
        { name: 'trainName', in: 'path', required: true, schema: { type: 'string' }, description: 'Train display name, e.g. `K351`' },
      ],
      get: {
        tags: ['Live API'],
        summary: 'Get a single train timetable',
        description: 'Returns the full stop-by-stop timetable for one train.',
        responses: {
          200: {
            description: 'Train timetable',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'K351' },
                    trainType: { type: 'string', example: 'L' },
                    trainId: { type: 'string', example: 'CityRail 51L' },
                    direction: { type: 'string', example: 'Down' },
                    notes: { type: 'string' },
                    nextCrewService: { type: 'string', example: 'K352' },
                    stops: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          stopName: { type: 'string', example: 'Kiama' },
                          arrival: { type: 'string', nullable: true, example: '9:05' },
                          departure: { type: 'string', nullable: true, example: '9:07' },
                          specialInstructions: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
};

module.exports = spec;
