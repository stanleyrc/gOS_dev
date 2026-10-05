"""Minimal Arrow IPC *file* writer for float32 columns.

Used by generate_sc_demo.py when pyarrow is not installed. It writes exactly
the layout gOS' coverage/hetsnps files use: non-nullable float32 columns
(x, y, color) in one record batch, IPC file format (ARROW1 magic + footer),
metadata version V5. Requires the `flatbuffers` package.
"""

import struct

import flatbuffers

# Arrow flatbuffer enum values (format/Schema.fbs, format/Message.fbs)
METADATA_V5 = 4
HEADER_SCHEMA = 1
HEADER_RECORD_BATCH = 3
TYPE_FLOATING_POINT = 3
PRECISION_SINGLE = 1


def _pad8(n):
    return (n + 7) & ~7


def _build_schema(builder, names):
    field_offsets = []
    for name in names:
        name_off = builder.CreateString(name)
        # FloatingPoint { precision: short }
        builder.StartObject(1)
        builder.PrependInt16Slot(0, PRECISION_SINGLE, 0)
        fp = builder.EndObject()
        builder.StartVector(4, 0, 4)
        children = builder.EndVector()
        # Field { name, nullable, type_type, type, dictionary, children, custom_metadata }
        builder.StartObject(7)
        builder.PrependUOffsetTRelativeSlot(0, name_off, 0)
        builder.PrependBoolSlot(1, False, False)
        builder.PrependUint8Slot(2, TYPE_FLOATING_POINT, 0)
        builder.PrependUOffsetTRelativeSlot(3, fp, 0)
        builder.PrependUOffsetTRelativeSlot(5, children, 0)
        field_offsets.append(builder.EndObject())
    builder.StartVector(4, len(field_offsets), 4)
    for off in reversed(field_offsets):
        builder.PrependUOffsetTRelative(off)
    fields = builder.EndVector()
    # Schema { endianness, fields, custom_metadata, features }
    builder.StartObject(4)
    builder.PrependInt16Slot(0, 0, 0)  # Little endian
    builder.PrependUOffsetTRelativeSlot(1, fields, 0)
    return builder.EndObject()


def _message(header_type, build_header, body_length):
    builder = flatbuffers.Builder(1024)
    header = build_header(builder)
    # Message { version, header_type, header, bodyLength, custom_metadata }
    builder.StartObject(5)
    builder.PrependInt16Slot(0, METADATA_V5, 0)
    builder.PrependUint8Slot(1, header_type, 0)
    builder.PrependUOffsetTRelativeSlot(2, header, 0)
    builder.PrependInt64Slot(3, body_length, 0)
    builder.Finish(builder.EndObject())
    return bytes(builder.Output())


def _framed(meta):
    padded = _pad8(len(meta) + 8) - 8  # continuation + length prefix keep 8-alignment
    return struct.pack("<Ii", 0xFFFFFFFF, padded) + meta + b"\x00" * (padded - len(meta)), padded


def write_float32_table(path, columns):
    """columns: dict name -> list of numbers (all the same length)."""
    names = list(columns)
    n = len(columns[names[0]])
    if any(len(columns[k]) != n for k in names):
        raise ValueError("columns differ in length")

    # Body: per column a zero-length validity buffer then the data buffer.
    body = b""
    buffers = []
    for name in names:
        buffers.append((len(body), 0))
        data = struct.pack(f"<{n}f", *columns[name])
        buffers.append((len(body), len(data)))
        body += data + b"\x00" * (_pad8(len(data)) - len(data))

    def record_batch(builder):
        # buffers: vector of struct Buffer { offset: long, length: long }
        builder.StartVector(16, len(buffers), 8)
        for offset, length in reversed(buffers):
            builder.PrependInt64(length)
            builder.PrependInt64(offset)
        buf_vec = builder.EndVector()
        # nodes: vector of struct FieldNode { length: long, null_count: long }
        builder.StartVector(16, len(names), 8)
        for _ in names:
            builder.PrependInt64(0)
            builder.PrependInt64(n)
        node_vec = builder.EndVector()
        # RecordBatch { length, nodes, buffers, compression, variadicBufferCounts }
        builder.StartObject(5)
        builder.PrependInt64Slot(0, n, 0)
        builder.PrependUOffsetTRelativeSlot(1, node_vec, 0)
        builder.PrependUOffsetTRelativeSlot(2, buf_vec, 0)
        return builder.EndObject()

    schema_msg, schema_len = _framed(_message(HEADER_SCHEMA, lambda b: _build_schema(b, names), 0))
    batch_msg, batch_len = _framed(_message(HEADER_RECORD_BATCH, record_batch, len(body)))

    out = bytearray(b"ARROW1\x00\x00")
    out += schema_msg
    batch_offset = len(out)
    out += batch_msg
    out += body
    out += struct.pack("<Ii", 0xFFFFFFFF, 0)  # end-of-stream marker

    builder = flatbuffers.Builder(1024)
    schema = _build_schema(builder, names)
    # recordBatches: vector of struct Block { offset: long, metaDataLength: int, pad, bodyLength: long }
    builder.StartVector(24, 1, 8)
    builder.PrependInt64(len(body))
    builder.Pad(4)
    builder.PrependInt32(batch_len + 8)
    builder.PrependInt64(batch_offset)
    blocks = builder.EndVector()
    builder.StartVector(24, 0, 8)
    dictionaries = builder.EndVector()
    # Footer { version, schema, dictionaries, recordBatches, custom_metadata }
    builder.StartObject(5)
    builder.PrependInt16Slot(0, METADATA_V5, 0)
    builder.PrependUOffsetTRelativeSlot(1, schema, 0)
    builder.PrependUOffsetTRelativeSlot(2, dictionaries, 0)
    builder.PrependUOffsetTRelativeSlot(3, blocks, 0)
    builder.Finish(builder.EndObject())
    footer = bytes(builder.Output())
    out += footer
    out += struct.pack("<i", len(footer))
    out += b"ARROW1"
    with open(path, "wb") as fh:
        fh.write(out)


def write_table(path, columns):
    """Write with pyarrow when available, else with the minimal writer."""
    try:
        import pyarrow as pa
        import pyarrow.ipc as ipc
    except ImportError:
        write_float32_table(path, columns)
        return
    table = pa.table({k: pa.array(v, type=pa.float32()) for k, v in columns.items()})
    with ipc.new_file(path, table.schema) as writer:
        writer.write_table(table)
