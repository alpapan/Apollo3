import {
  Assembly,
  RefSeq,
  type AssemblyDocument,
  type RefSeqDocument,
} from '@apollo-annotation/schemas'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'

import { CreateRefSeqDto } from './dto/create-refSeq.dto.js'
import { FindRefSeqDto } from './dto/find-refSeq.dto.js'
import { UpdateRefSeqDto } from './dto/update-refSeq.dto.js'

@Injectable()
export class RefSeqsService {
  constructor(
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    @InjectModel(Assembly.name)
    private readonly assemblyModel: Model<AssemblyDocument>,
  ) {}

  private readonly logger = new Logger(RefSeqsService.name)

  create(createRefSeqDto: CreateRefSeqDto) {
    return this.refSeqModel.create(createRefSeqDto)
  }

  async findAll(filter?: FindRefSeqDto) {
    if (!filter?.assembly) {
      // eslint-disable-next-line unicorn/no-array-callback-reference
      return this.refSeqModel.find({}).exec()
    }

    let assemblyId: string
    if (
      Types.ObjectId.isValid(filter.assembly) &&
      filter.assembly.length === 24
    ) {
      assemblyId = filter.assembly
    } else {
      const assembly = await this.assemblyModel
        .findOne({ name: filter.assembly })
        .exec()
      if (!assembly) {
        throw new NotFoundException(`Assembly "${filter.assembly}" not found`)
      }
      assemblyId = assembly._id.toString()
    }

    // eslint-disable-next-line unicorn/no-array-callback-reference
    return this.refSeqModel.find({ ...filter, assembly: assemblyId }).exec()
  }

  async findOne(id: string) {
    const refSeq = await this.refSeqModel.findById(id).exec()
    if (!refSeq) {
      throw new NotFoundException(`RefSeq with id "${id}" not found`)
    }
    return refSeq
  }

  update(id: string, updateRefSeqDto: UpdateRefSeqDto) {
    return this.refSeqModel
      .findByIdAndUpdate(id, updateRefSeqDto, { runValidators: true })
      .exec()
  }

  remove(id: string) {
    return this.refSeqModel.findByIdAndDelete(id).exec()
  }
}
