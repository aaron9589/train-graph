'use strict';

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'LiveRun API',
    version: '1.6.0',
    description:
      'REST API for the LiveRun model railway session planner. ' +
      'The **Live API** endpoints (under `/live/`) are read-only and intended for external systems such as guard panels, operator displays, and JMRI integrations. ' +
      'All other endpoints are used by the LiveRun web UI.',
  },
  tags: [
    { name: 'Timetables', description: 'Create and manage timetables' },
    { name: 'Stations', description: 'Stations within a timetable' },
    { name: 'Trains', description: 'Trains and stop times' },
    { name: 'Crews', description: 'Crew members and assignments' },
    { name: 'Paths', description: 'Reusable route templates' },
    { name: 'Live API', description: 'Read-only endpoints for external systems' },
  ],
  components: {
    schemas: {
      TimetableSummary: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'B Session' },
          description: { type: 'string' },
          start_time: { type: 'string', example: '06:00' },
          end_time: { type: 'string', example: '22:00' },
          active: { type: 'boolean', description: 'Whether this is the currently active timetable' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Timetable: {
        allOf: [
          { $ref: '#/components/schemas/TimetableSummary' },
          {
            type: 'object',
            properties: {
              stations: { type: 'array', items: { $ref: '#/components/schemas/Station' } },
              trains: { type: 'array', items: { $ref: '#/components/schemas/Train' } },
              paths: { type: 'array', items: { $ref: '#/components/schemas/Path' } },
              crews: { type: 'array', items: { $ref: '#/components/schemas/Crew' } },
              settings: { $ref: '#/components/schemas/TimetableSettings' },
            },
          },
        ],
      },
      TimetableSettings: {
        type: 'object',
        properties: {
          clock_enabled: { type: 'boolean' },
          clock_broker_url: { type: 'string', example: 'wss://broker.example.com:9001/mqtt' },
          clock_topic: { type: 'string', example: 'trains/jmri/memory/currentTime' },
        },
      },
      Station: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          timetable_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Kiama' },
          short_code: { type: 'string', example: 'KIA' },
          distance: { type: 'number', nullable: true, description: 'Real-world distance in km (optional)' },
          graph_pos: { type: 'number', description: 'Y-axis position on the train graph' },
          sort_order: { type: 'integer' },
        },
      },
      Train: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          timetable_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: '8L02' },
          color: { type: 'string', example: '#3b82f6' },
          notes: { type: 'string' },
          train_type: { type: 'string', example: 'L' },
          train_id: { type: 'string', example: 'CityRail 8L02', description: 'Roster/JMRI ID' },
          direction: { type: 'string', example: 'Down' },
          crew_id: { type: 'string', format: 'uuid', nullable: true },
          stops: { type: 'array', items: { $ref: '#/components/schemas/TrainStop' } },
        },
      },
      TrainStop: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          train_id: { type: 'string', format: 'uuid' },
          station_id: { type: 'string', format: 'uuid' },
          arrival: { type: 'string', nullable: true, example: '9:32' },
          departure: { type: 'string', nullable: true, example: '9:34' },
          special_instructions: { type: 'string', nullable: true },
        },
      },
      Path: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          timetable_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Staging (Down) -> Nowra' },
          stops: { type: 'array', items: { $ref: '#/components/schemas/PathStop' } },
        },
      },
      PathStop: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          path_id: { type: 'string', format: 'uuid' },
          station_id: { type: 'string', format: 'uuid' },
          sort_order: { type: 'integer' },
          travel_time_from_prev: { type: 'integer', description: 'Minutes of travel from previous stop' },
          dwell_time: { type: 'integer', description: 'Minutes dwell at this station' },
        },
      },
      Crew: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          timetable_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Local Operator 1' },
          color: { type: 'string', example: '#f59e0b' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
    },
    responses: {
      NotFound: {
        description: 'Not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  paths: {
    // ── Timetables ──────────────────────────────────────────────
    '/api/timetables': {
      get: {
        tags: ['Timetables'],
        summary: 'List all timetables',
        responses: {
          200: {
            description: 'Array of timetable summaries, sorted by last-updated',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TimetableSummary' } } } },
          },
        },
      },
      post: {
        tags: ['Timetables'],
        summary: 'Create a timetable',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  startTime: { type: 'string', example: '06:00' },
                  endTime: { type: 'string', example: '22:00' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          400: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/import': {
      post: {
        tags: ['Timetables'],
        summary: 'Import a timetable from a JSON backup',
        description: 'All IDs are regenerated on import so it is safe to import a timetable that already exists.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } },
        },
        responses: {
          201: { description: 'Imported timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          400: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        tags: ['Timetables'],
        summary: 'Get a timetable (full)',
        responses: {
          200: { description: 'Timetable with stations, trains, paths, crews', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Timetables'],
        summary: 'Update timetable name / time window',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  startTime: { type: 'string' },
                  endTime: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Timetables'],
        summary: 'Delete a timetable',
        responses: {
          200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/duplicate': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        tags: ['Timetables'],
        summary: 'Duplicate a timetable',
        description: 'Creates a deep copy with fresh IDs and the name suffixed with " (copy)".',
        responses: {
          201: { description: 'Duplicated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/restore': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        tags: ['Timetables'],
        summary: 'Restore undo snapshot',
        description: 'Used by the undo/redo system to restore stations, trains, paths, and/or crews.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  stations: { type: 'array', items: { $ref: '#/components/schemas/Station' } },
                  trains: { type: 'array', items: { $ref: '#/components/schemas/Train' } },
                  paths: { type: 'array', items: { $ref: '#/components/schemas/Path' } },
                  crews: { type: 'array', items: { $ref: '#/components/schemas/Crew' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/settings': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      put: {
        tags: ['Timetables'],
        summary: 'Update timetable settings (MQTT fast clock)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TimetableSettings' } } },
        },
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Active timetable ────────────────────────────────────────
    '/api/active-timetable': {
      get: {
        tags: ['Timetables'],
        summary: 'Get the active timetable ID',
        description: 'Returns the ID of the timetable flagged as active, or `null` if none.',
        responses: {
          200: {
            description: 'Active timetable ID',
            content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid', nullable: true } } } } },
          },
        },
      },
      put: {
        tags: ['Timetables'],
        summary: 'Set (or clear) the active timetable',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'string', format: 'uuid', nullable: true, description: 'Pass null to clear the active flag' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated active ID', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string', nullable: true } } } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Stations ────────────────────────────────────────────────
    '/api/timetables/{id}/stations': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        tags: ['Stations'],
        summary: 'Add a station',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'graphPos'],
                properties: {
                  name: { type: 'string' },
                  shortCode: { type: 'string' },
                  distance: { type: 'number', nullable: true },
                  graphPos: { type: 'number' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          400: { $ref: '#/components/responses/NotFound' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/stations/{stationId}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'stationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      put: {
        tags: ['Stations'],
        summary: 'Update a station',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  shortCode: { type: 'string' },
                  distance: { type: 'number', nullable: true },
                  graphPos: { type: 'number' },
                  sortOrder: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Stations'],
        summary: 'Delete a station',
        description: 'Also removes all train stops and path stops referencing this station.',
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Paths ───────────────────────────────────────────────────
    '/api/timetables/{id}/paths': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        tags: ['Paths'],
        summary: 'Create a path',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  stops: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        stationId: { type: 'string', format: 'uuid' },
                        travelTimeFromPrev: { type: 'integer' },
                        dwellTime: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/paths/{pathId}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'pathId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      put: {
        tags: ['Paths'],
        summary: 'Update a path',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  stops: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Paths'],
        summary: 'Delete a path',
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Trains ──────────────────────────────────────────────────
    '/api/timetables/{id}/trains': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        tags: ['Trains'],
        summary: 'Add a train',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: '8L02' },
                  color: { type: 'string', example: '#3b82f6' },
                  notes: { type: 'string' },
                  trainType: { type: 'string', example: 'L' },
                  trainId: { type: 'string', description: 'Roster/JMRI ID' },
                  direction: { type: 'string', example: 'Down' },
                  crewId: { type: 'string', format: 'uuid', nullable: true },
                  stops: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        stationId: { type: 'string', format: 'uuid' },
                        arrival: { type: 'string', nullable: true },
                        departure: { type: 'string', nullable: true },
                        specialInstructions: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/trains/auto-assign': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        tags: ['Trains', 'Crews'],
        summary: 'Auto-assign trains to crew members',
        description:
          'Distributes trains across the given crew pool without scheduling conflicts. ' +
          'Trains are sorted by start time and assigned to the crew member with the fewest jobs who is currently free. ' +
          'Returns the updated timetable plus an `unassigned` array of train names that could not be assigned.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['crewIds'],
                properties: {
                  crewIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Crew pool to assign from' },
                  trainIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Subset of trains to assign (all if omitted)' },
                  onlyUnassigned: { type: 'boolean', description: 'Skip trains already assigned to a crew member' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated timetable plus any trains that could not be assigned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Timetable' },
                    { type: 'object', properties: { unassigned: { type: 'array', items: { type: 'string' }, description: 'Train names that could not be assigned' } } },
                  ],
                },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/trains/{trainId}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'trainId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      put: {
        tags: ['Trains'],
        summary: 'Update a train',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, color: { type: 'string' }, notes: { type: 'string' }, trainType: { type: 'string' }, trainId: { type: 'string' }, direction: { type: 'string' }, crewId: { type: 'string', nullable: true }, stops: { type: 'array', items: { type: 'object' } } } } } },
        },
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Trains'],
        summary: 'Delete a train',
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Crews ───────────────────────────────────────────────────
    '/api/timetables/{id}/crews': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        tags: ['Crews'],
        summary: 'Add a crew member',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, color: { type: 'string' } } } } },
        },
        responses: {
          201: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/crews/reorder': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      put: {
        tags: ['Crews'],
        summary: 'Reorder crew members',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['order'], properties: { order: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Crew IDs in desired display order' } } } } },
        },
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          400: { $ref: '#/components/responses/NotFound' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/timetables/{id}/crews/{crewId}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'crewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      put: {
        tags: ['Crews'],
        summary: 'Update a crew member',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, color: { type: 'string' } } } } },
        },
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Crews'],
        summary: 'Delete a crew member',
        description: 'Also clears the crew assignment from all trains in this timetable.',
        responses: {
          200: { description: 'Updated timetable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timetable' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Live API ────────────────────────────────────────────────
    '/api/timetables/{id}/live/trains': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        tags: ['Live API'],
        summary: 'List all trains (read-only)',
        description: 'Returns all trains sorted by start time. All times use `H:MM` format (no leading zero).',
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
                          trainId: { type: 'string', example: 'CityRail 51L' },
                          direction: { type: 'string', example: 'Down' },
                          notes: { type: 'string' },
                          nextCrewService: { type: 'string', description: 'Name of the next train this crew member works, if assigned', example: 'K352' },
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
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'trainName', in: 'path', required: true, schema: { type: 'string' }, description: 'Train display name (e.g. `K351`)' },
      ],
      get: {
        tags: ['Live API'],
        summary: 'Get a single train timetable (read-only)',
        description: 'Returns the full stop-by-stop timetable for one train. All times use `H:MM` format.',
        responses: {
          200: {
            description: 'Train timetable',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    trainType: { type: 'string' },
                    trainId: { type: 'string' },
                    direction: { type: 'string' },
                    notes: { type: 'string' },
                    nextCrewService: { type: 'string' },
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
